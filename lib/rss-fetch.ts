import http from 'http';
import https from 'https';
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

async function fetchRssXmlWithRedirects(url: URL, redirects: number): Promise<string> {
  await ensureUrlAllowed(url.toString());

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

        if (statusCode >= 300 && statusCode < 400) {
          response.resume();

          if (redirects >= MAX_RSS_REDIRECTS) {
            reject(new Error('Too many RSS feed redirects'));
            return;
          }

          const location = response.headers.location;
          if (!location) {
            reject(new Error('RSS feed redirect missing location'));
            return;
          }

          let nextUrl: URL;
          try {
            nextUrl = new URL(Array.isArray(location) ? location[0] : location, url);
          } catch (error) {
            reject(new Error('RSS feed redirect has invalid location'));
            return;
          }

          fetchRssXmlWithRedirects(nextUrl, redirects + 1).then(resolve, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`RSS feed request failed with status ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        response.on('data', (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;

          if (receivedBytes > MAX_RSS_RESPONSE_BYTES) {
            request.destroy(new Error('RSS feed response too large'));
            return;
          }

          chunks.push(buffer);
        });
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`RSS feed request timed out after ${RSS_CONFIG.FEED_TIMEOUT}ms`));
    });
    request.on('error', reject);
    request.end();
  });
}

export function createPublicHostnameLookup(): http.RequestOptions['lookup'] {
  return (hostname, _options, callback) => {
    resolvePublicAddress(hostname)
      .then(({ address, family }) => callback(null, address, family))
      .catch((error) => callback(error as NodeJS.ErrnoException, '', 0));
  };
}

async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const literalFamily = net.isIP(hostname);

  if (literalFamily) {
    assertAddressAllowed(hostname);
    return { address: hostname, family: literalFamily };
  }

  const addresses = await dns.lookup(hostname, { all: true });

  if (addresses.length === 0) {
    throw new Error('Hostname did not resolve');
  }

  for (const item of addresses) {
    assertAddressAllowed(item.address);
  }

  const first = addresses[0];
  return { address: first.address, family: first.family };
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
