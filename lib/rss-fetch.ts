import http from 'http';
import https from 'https';
import http2 from 'http2';
import tls from 'tls';
import dns from 'dns/promises';
import net from 'net';
import { RSS_CONFIG } from '@/lib/rss-config';
import { getAllowedFeedCidrs } from '@/lib/env';

const MAX_RSS_REDIRECTS = 3;
const MAX_RSS_RESPONSE_BYTES = 5 * 1024 * 1024;

const blockedNetworks = new net.BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedNetworks.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const) {
  blockedNetworks.addSubnet(network, prefix, 'ipv6');
}

interface ResolvedAddress {
  address: string;
  family: number;
}

export async function fetchRssXml(feedUrl: string): Promise<string> {
  return fetchRssXmlWithRedirects(new URL(feedUrl), 0);
}

export async function ensureUrlAllowed(feedUrl: string): Promise<void> {
  try {
    const url = new URL(feedUrl);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only HTTP/HTTPS URLs are allowed');
    }

    await resolvePublicAddress(url.hostname);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Feed URL not allowed: ${message}`);
  }
}

interface FeedResponse {
  statusCode: number;
  location?: string;
  body: string;
}

async function fetchRssXmlWithRedirects(url: URL, redirects: number): Promise<string> {
  await ensureUrlAllowed(url.toString());

  const response = await requestFeed(url);

  if (response.statusCode >= 300 && response.statusCode < 400) {
    if (redirects >= MAX_RSS_REDIRECTS) {
      throw new Error('Too many RSS feed redirects');
    }

    if (!response.location) {
      throw new Error('RSS feed redirect missing location');
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(response.location, url);
    } catch (error) {
      throw new Error('RSS feed redirect has invalid location');
    }

    return fetchRssXmlWithRedirects(nextUrl, redirects + 1);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error(
        `The site refused the request (HTTP ${response.statusCode}). It blocks automated requests even when the same URL opens in a browser.`
      );
    }

    throw new Error(`RSS feed request failed with status ${response.statusCode}`);
  }

  return response.body;
}

async function requestFeed(url: URL): Promise<FeedResponse> {
  // Some sites only answer over HTTP/2 and return 403 to HTTP/1.1 clients,
  // even though the same URL loads fine in a browser. Negotiate the protocol
  // first so we use HTTP/2 wherever the server supports it.
  if (url.protocol === 'https:' && await supportsHttp2(url.hostname)) {
    return requestFeedHttp2(url);
  }

  return requestFeedHttp1(url);
}

async function supportsHttp2(hostname: string): Promise<boolean> {
  // Resolve through the same SSRF guard as the actual request, and pin the
  // socket to the validated address so the probe cannot be re-pointed.
  let address: ResolvedAddress;
  try {
    address = await resolvePublicAddress(hostname);
  } catch {
    // Let the HTTP/1.1 path surface the resolution error with its usual message.
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (supported: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(supported);
    };

    const socket = tls.connect({
      host: address.address,
      port: 443,
      servername: net.isIP(hostname) ? undefined : hostname,
      ALPNProtocols: ['h2', 'http/1.1'],
      timeout: RSS_CONFIG.ALPN_PROBE_TIMEOUT,
    });

    socket.once('secureConnect', () => finish(socket.alpnProtocol === 'h2'));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function requestFeedHttp1(url: URL): Promise<FeedResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': RSS_CONFIG.USER_AGENT,
        },
        timeout: RSS_CONFIG.FEED_TIMEOUT,
        lookup: createPublicHostnameLookup(),
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;
        const redirectLocation = Array.isArray(location) ? location[0] : location;

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          resolve({ statusCode, location: redirectLocation, body: '' });
          return;
        }

        collectBody(response, (error, body) => {
          if (error) {
            reject(error);
            return;
          }

          resolve({ statusCode, location: redirectLocation, body });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`RSS feed request timed out after ${RSS_CONFIG.FEED_TIMEOUT}ms`));
    });
    request.on('error', reject);
    request.end();
  });
}

function requestFeedHttp2(url: URL): Promise<FeedResponse> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(url.origin, {
      lookup: createPublicHostnameLookup(),
    });

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      client.close();
      fn();
    };

    client.setTimeout(RSS_CONFIG.FEED_TIMEOUT, () => {
      finish(() => reject(new Error(`RSS feed request timed out after ${RSS_CONFIG.FEED_TIMEOUT}ms`)));
    });

    client.once('error', (error) => finish(() => reject(error)));

    const request = client.request({
      ':path': `${url.pathname}${url.search}`,
      ':method': 'GET',
      'user-agent': RSS_CONFIG.USER_AGENT,
    });

    request.once('response', (headers) => {
      const statusCode = Number(headers[':status'] ?? 0);
      const header = headers.location;
      const location = Array.isArray(header) ? header[0] : header;

      if (statusCode < 200 || statusCode >= 300) {
        request.resume();
        request.once('end', () => finish(() => resolve({ statusCode, location, body: '' })));
        return;
      }

      collectBody(request, (error, body) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        finish(() => resolve({ statusCode, location, body }));
      });
    });

    request.once('error', (error) => finish(() => reject(error)));
    request.end();
  });
}

function collectBody(
  stream: NodeJS.ReadableStream,
  callback: (error: Error | null, body: string) => void
) {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  stream.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;

    if (receivedBytes > MAX_RSS_RESPONSE_BYTES) {
      callback(new Error('RSS feed response too large'), '');
      return;
    }

    chunks.push(buffer);
  });
  stream.once('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
  stream.once('error', (error) => callback(error as Error, ''));
}

export function createPublicHostnameLookup(): http.RequestOptions['lookup'] {
  return (hostname, options, callback) => {
    const callbackAny = callback as (...args: any[]) => void;
    const lookupAll = typeof options === 'object' && options !== null && options.all === true;

    resolvePublicAddresses(hostname)
      .then((addresses) => {
        if (lookupAll) {
          callbackAny(null, addresses);
          return;
        }

        const { address, family } = addresses[0];
        callbackAny(null, address, family);
      })
      .catch((error) => {
        if (lookupAll) {
          callbackAny(error as NodeJS.ErrnoException, []);
          return;
        }

        callbackAny(error as NodeJS.ErrnoException, '', 0);
      });
  };
}

async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const addresses = await resolvePublicAddresses(hostname);
  return addresses[0];
}

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const literalFamily = net.isIP(hostname);

  if (literalFamily) {
    assertAddressAllowed(hostname);
    return [{ address: hostname, family: literalFamily }];
  }

  const addresses = await dns.lookup(hostname, { all: true });

  if (addresses.length === 0) {
    throw new Error('Hostname did not resolve');
  }

  for (const item of addresses) {
    assertAddressAllowed(item.address);
  }

  return addresses.map(({ address, family }) => ({ address, family }));
}

function assertAddressAllowed(address: string) {
  if (isAllowedByConfiguredCidr(address)) {
    return;
  }

  const mappedIpv4 = parseIpv4MappedIpv6(address);
  if (mappedIpv4) {
    assertAddressAllowed(mappedIpv4);
    return;
  }

  const family = net.isIP(address);
  if (family === 4 && blockedNetworks.check(address, 'ipv4')) {
    throw new Error('Resolved to a private or reserved IP address');
  }

  if (family === 6 && blockedNetworks.check(address, 'ipv6')) {
    throw new Error('Resolved to a private or reserved IPv6 address');
  }

  if (!family) {
    throw new Error('Resolved to an invalid IP address');
  }
}

function isAllowedByConfiguredCidr(address: string): boolean {
  if (net.isIP(address) !== 4 || blockedNetworks.check(address, 'ipv4')) {
    return false;
  }

  return getAllowedFeedCidrs().some((cidr) => cidrContains(cidr, address));
}

function cidrContains(cidr: string, ip: string) {
  const [range, bits] = cidr.split('/');
  const prefixLength = Number(bits);

  if (
    net.isIP(range) !== 4
    || net.isIP(ip) !== 4
    || !Number.isInteger(prefixLength)
    || prefixLength < 8
    || prefixLength > 32
    || blockedNetworks.check(range, 'ipv4')
  ) {
    return false;
  }

  const mask = ~(2 ** (32 - prefixLength) - 1) >>> 0;
  return (ipToLong(range) & mask) === (ipToLong(ip) & mask);
}

function ipToLong(ip: string) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function parseIpv4MappedIpv6(address: string): string | null {
  const normalized = address.toLowerCase();
  const dottedMatch = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);

  if (dottedMatch) {
    return net.isIP(dottedMatch[1]) === 4 ? dottedMatch[1] : null;
  }

  const hexMatch = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);

  if (!hexMatch) {
    return null;
  }

  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);

  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
