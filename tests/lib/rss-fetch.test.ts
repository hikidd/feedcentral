import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const mockLookup = jest.fn();
const mockHttpRequest = jest.fn();
const mockHttpsRequest = jest.fn();
const mockHttp2Connect = jest.fn();
const mockTlsConnect = jest.fn();

jest.mock('dns/promises', () => ({
  __esModule: true,
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

jest.mock('http', () => ({
  __esModule: true,
  default: { request: mockHttpRequest },
  request: mockHttpRequest,
}));

jest.mock('https', () => ({
  __esModule: true,
  default: { request: mockHttpsRequest },
  request: mockHttpsRequest,
}));

jest.mock('http2', () => ({
  __esModule: true,
  default: { connect: mockHttp2Connect },
  connect: mockHttp2Connect,
}));

jest.mock('tls', () => ({
  __esModule: true,
  default: { connect: mockTlsConnect },
  connect: mockTlsConnect,
}));

function createMockRequest(onEnd: () => void) {
  const request = new EventEmitter() as EventEmitter & {
    end: jest.Mock;
    destroy: jest.Mock;
  };
  request.end = jest.fn(onEnd);
  request.destroy = jest.fn((error?: Error) => {
    if (error) {
      request.emit('error', error);
    }
  });
  return request;
}

function mockAlpn(protocol: string | false) {
  mockTlsConnect.mockImplementation(() => {
    const socket = new EventEmitter() as EventEmitter & {
      alpnProtocol: string | false;
      destroy: jest.Mock;
    };
    socket.alpnProtocol = protocol;
    socket.destroy = jest.fn();

    setImmediate(() => {
      if (protocol === false) {
        socket.emit('error', new Error('handshake failed'));
        return;
      }

      socket.emit('secureConnect');
    });

    return socket;
  });
}

function mockHttp1Response(statusCode: number, body: string, location?: string) {
  const implementation = (_url: unknown, _options: unknown, callback: any) => {
    const response = new PassThrough() as PassThrough & {
      statusCode: number;
      headers: Record<string, string>;
    };
    response.statusCode = statusCode;
    response.headers = location ? { location } : {};

    return createMockRequest(() => {
      callback(response);
      response.end(body);
    });
  };

  mockHttpsRequest.mockImplementation(implementation);
  mockHttpRequest.mockImplementation(implementation);
}

function createHttp2Session(options: { status: number; body: string; location?: string }) {
  const session = new EventEmitter() as EventEmitter & {
    request: jest.Mock;
    close: jest.Mock;
    setTimeout: jest.Mock;
  };
  session.close = jest.fn();
  session.setTimeout = jest.fn();
  session.request = jest.fn(() => {
    const stream = new PassThrough();
    const endStream = stream.end.bind(stream);
    const streamWithSpy = stream as unknown as { end: jest.Mock };

    streamWithSpy.end = jest.fn(() => {
      setImmediate(() => {
        const headers: Record<string, number | string> = { ':status': options.status };
        if (options.location) {
          headers.location = options.location;
        }

        stream.emit('response', headers);

        // Simulate the body arriving, then the stream finishing.
        if (options.body) {
          stream.write(options.body);
        }
        endStream();
      });
    });
    return stream;
  });

  return session;
}

function mockHttp2Session(options: { status: number; body: string; location?: string }) {
  const session = createHttp2Session(options);
  mockHttp2Connect.mockReturnValue(session);
  return session;
}

function mockHttp2Sessions(...responses: Array<{ status: number; body: string; location?: string }>) {
  const sessions = responses.map(createHttp2Session);
  mockHttp2Connect.mockImplementation(() => sessions.shift());
  return sessions;
}

describe('RSS fetch SSRF protections', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.RSS_ALLOWED_CIDRS;
    delete process.env.ALLOWED_FEED_CIDRS;
    mockLookup.mockReset();
    mockHttpRequest.mockReset();
    mockHttpsRequest.mockReset();
    mockHttp2Connect.mockReset();
    mockTlsConnect.mockReset();
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mockAlpn(false);
  });

  it('rejects private and reserved DNS results', async () => {
    mockLookup.mockResolvedValue([{ address: '100.64.0.1', family: 4 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Resolved to a private or reserved IP address');
  });

  it('rejects IPv4-mapped loopback IPv6 results', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Feed URL not allowed');
  });

  it('rejects hexadecimal IPv4-mapped IPv6 private result ::ffff:7f00:1', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:7f00:1', family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Resolved to a private or reserved IP address');
  });

  it('rejects hexadecimal IPv4-mapped IPv6 private result ::ffff:a00:1', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:a00:1', family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Resolved to a private or reserved IP address');
  });

  it('rejects hexadecimal IPv4-mapped IPv6 private result ::ffff:a9fe:a9fe', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:a9fe:a9fe', family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Resolved to a private or reserved IP address');
  });

  it('rejects hexadecimal IPv4-mapped IPv6 private result ::ffff:ac10:1', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:ac10:1', family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Resolved to a private or reserved IP address');
  });

  it('rejects hexadecimal IPv4-mapped IPv6 private result ::ffff:c0a8:1', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:c0a8:1', family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Resolved to a private or reserved IP address');
  });

  it('does not let configured CIDR exceptions allow private addresses', async () => {
    process.env.RSS_ALLOWED_CIDRS = '10.0.0.0/8';
    mockLookup.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('http://publisher.example/feed.xml'))
      .rejects.toThrow('Resolved to a private or reserved IP address');
  });

  it('rejects redirects to private hosts before making the redirected request', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);
    mockHttp1Response(302, '', 'http://internal.example/feed.xml');
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('http://publisher.example/feed.xml')).rejects.toThrow('Feed URL not allowed');
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
  });

  it('fetches XML through a validated lookup for the actual request', async () => {
    mockHttp1Response(200, '<rss><channel /></rss>');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('http://publisher.example/feed.xml')).resolves.toBe('<rss><channel /></rss>');
    expect(mockHttpRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lookup: expect.any(Function) }),
      expect.any(Function)
    );
  });

  it('returns address arrays when Node requests all lookup results', async () => {
    mockLookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '8.8.4.4', family: 4 },
    ]);
    const { createPublicHostnameLookup } = require('@/lib/rss-fetch');
    const lookup = createPublicHostnameLookup();

    await expect(new Promise((resolve, reject) => {
      (lookup as any)('publisher.example', { all: true }, (error: Error | null, addresses: unknown) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(addresses);
      });
    })).resolves.toEqual([
      { address: '8.8.8.8', family: 4 },
      { address: '8.8.4.4', family: 4 },
    ]);
  });

  it('explains a 403 instead of surfacing a bare status code', async () => {
    mockHttp1Response(403, '');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('http://publisher.example/feed.xml')).rejects.toThrow(
      'The site refused the request (HTTP 403)'
    );
  });
});

describe('RSS fetch protocol negotiation', () => {
  beforeEach(() => {
    jest.resetModules();
    mockLookup.mockReset();
    mockHttpRequest.mockReset();
    mockHttpsRequest.mockReset();
    mockHttp2Connect.mockReset();
    mockTlsConnect.mockReset();
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });

  it('uses HTTP/2 when the server negotiates h2', async () => {
    mockAlpn('h2');
    const session = mockHttp2Session({ status: 200, body: '<rss>h2</rss>' });

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('https://linux.example/feed.rss')).resolves.toBe('<rss>h2</rss>');
    expect(session.request).toHaveBeenCalledWith(
      expect.objectContaining({ ':path': '/feed.rss', ':method': 'GET' })
    );
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it('falls back to HTTP/1.1 when the server does not offer h2', async () => {
    mockAlpn('http/1.1');
    mockHttp1Response(200, '<rss>h1</rss>');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('https://legacy.example/feed.xml')).resolves.toBe('<rss>h1</rss>');
    expect(mockHttp2Connect).not.toHaveBeenCalled();
    expect(mockHttpsRequest).toHaveBeenCalled();
  });

  it('falls back to HTTP/1.1 when the ALPN probe fails', async () => {
    mockAlpn(false);
    mockHttp1Response(200, '<rss>fallback</rss>');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('https://broken.example/feed.xml')).resolves.toBe('<rss>fallback</rss>');
    expect(mockHttp2Connect).not.toHaveBeenCalled();
  });

  it('does not probe ALPN for plain http URLs', async () => {
    mockHttp1Response(200, '<rss>plain</rss>');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('http://plain.example/feed.xml')).resolves.toBe('<rss>plain</rss>');
    expect(mockTlsConnect).not.toHaveBeenCalled();
  });

  it('follows HTTP/2 redirects', async () => {
    mockAlpn('h2');
    mockHttp2Sessions(
      { status: 302, body: '', location: '/moved.rss' },
      { status: 200, body: '<rss>moved</rss>' }
    );

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('https://linux.example/feed.rss')).resolves.toBe('<rss>moved</rss>');
    expect(mockHttp2Connect).toHaveBeenCalledTimes(2);
  });

  it('reports a 403 over HTTP/2 without retrying HTTP/1.1', async () => {
    mockAlpn('h2');
    mockHttp2Session({ status: 403, body: '' });

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('https://blocked.example/feed.rss')).rejects.toThrow(
      'The site refused the request (HTTP 403)'
    );
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it('pins the ALPN probe to the SSRF-validated address', async () => {
    mockAlpn('http/1.1');
    mockHttp1Response(200, '<rss />');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await fetchRssXml('https://publisher.example/feed.xml');

    expect(mockTlsConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        servername: 'publisher.example',
        ALPNProtocols: ['h2', 'http/1.1'],
      })
    );
  });

  it('does not probe ALPN when the host resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('https://internal.example/feed.xml')).rejects.toThrow('Feed URL not allowed');
    expect(mockTlsConnect).not.toHaveBeenCalled();
  });
});

describe('RSS fetch retry', () => {
  beforeEach(() => {
    jest.resetModules();
    mockLookup.mockReset();
    mockHttpRequest.mockReset();
    mockHttpsRequest.mockReset();
    mockHttp2Connect.mockReset();
    mockTlsConnect.mockReset();
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mockAlpn(false);
  });

  it('retries once when the first attempt times out', async () => {
    mockHttpsRequest.mockImplementationOnce(() => {
      const request = createMockRequest(() => {
        setImmediate(() => request.emit('timeout'));
      });
      return request;
    });
    mockHttp1Response(200, '<rss>retried</rss>');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    // The retry waits RETRY_DELAY_MS before trying again.
    await expect(fetchRssXml('https://slow.example/feed.xml')).resolves.toBe('<rss>retried</rss>');
    expect(mockHttpsRequest).toHaveBeenCalledTimes(2);
  }, 10000);

  it('does not retry when the site refuses the request', async () => {
    mockHttp1Response(403, '');

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('https://blocked.example/feed.xml')).rejects.toThrow('HTTP 403');
    expect(mockHttpsRequest).toHaveBeenCalledTimes(1);
  });
});
