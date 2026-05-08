import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const mockLookup = jest.fn();
const mockHttpRequest = jest.fn();

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

describe('RSS fetch SSRF protections', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.RSS_ALLOWED_CIDRS;
    delete process.env.ALLOWED_FEED_CIDRS;
    mockLookup.mockReset();
    mockHttpRequest.mockReset();
  });

  it('rejects private and reserved DNS results', async () => {
    mockLookup.mockResolvedValue([{ address: '100.64.0.1', family: 4 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('https://publisher.example/feed.xml')).rejects.toThrow('Feed URL not allowed');
  });

  it('rejects IPv4-mapped loopback IPv6 results', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('https://publisher.example/feed.xml')).rejects.toThrow('Feed URL not allowed');
  });

  it.each([
    '::ffff:7f00:1',
    '::ffff:a00:1',
    '::ffff:a9fe:a9fe',
    '::ffff:ac10:1',
    '::ffff:c0a8:1',
  ])('rejects hexadecimal IPv4-mapped IPv6 private result %s', async (address) => {
    mockLookup.mockResolvedValue([{ address, family: 6 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('https://publisher.example/feed.xml')).rejects.toThrow('Feed URL not allowed');
  });

  it('does not let configured CIDR exceptions allow private addresses', async () => {
    process.env.RSS_ALLOWED_CIDRS = '169.254.0.0/16';
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const { ensureUrlAllowed } = require('@/lib/rss-fetch');

    await expect(ensureUrlAllowed('https://publisher.example/feed.xml')).rejects.toThrow('Feed URL not allowed');
  });

  it('rejects redirects to private hosts before making the redirected request', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mockHttpRequest.mockImplementation((_url, _options, callback) => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = 302;
      response.headers = { location: 'http://169.254.169.254/latest/meta-data' };

      return createMockRequest(() => {
        callback(response);
        response.end();
      });
    });

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('http://publisher.example/feed.xml')).rejects.toThrow('Feed URL not allowed');
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
  });

  it('fetches XML through a validated lookup for the actual request', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mockHttpRequest.mockImplementation((_url, options, callback) => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = 200;
      response.headers = {};

      return createMockRequest(() => {
        expect(options.lookup).toEqual(expect.any(Function));
        callback(response);
        response.end('<rss><channel /></rss>');
      });
    });

    const { fetchRssXml } = require('@/lib/rss-fetch');

    await expect(fetchRssXml('http://publisher.example/feed.xml')).resolves.toBe('<rss><channel /></rss>');
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
});
