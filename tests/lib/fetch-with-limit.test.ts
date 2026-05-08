import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const mockLookup = jest.fn();
const mockHttpsRequest = jest.fn();

jest.mock('dns/promises', () => ({
  __esModule: true,
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

jest.mock('https', () => ({
  __esModule: true,
  default: { request: mockHttpsRequest },
  request: mockHttpsRequest,
}));

function createMockRequest(onEnd: () => void) {
  const request = new EventEmitter() as EventEmitter & {
    end: jest.Mock;
    destroy: jest.Mock;
    setTimeout: jest.Mock;
  };
  request.end = jest.fn(onEnd);
  request.destroy = jest.fn((error?: Error) => {
    if (error) {
      request.emit('error', error);
    }
  });
  request.setTimeout = jest.fn();
  return request;
}

describe('fetchWithLimit SSRF protections', () => {
  beforeEach(() => {
    jest.resetModules();
    mockLookup.mockReset();
    mockHttpsRequest.mockReset();
  });

  it('rejects private DNS results before fetching images', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const { fetchWithLimit } = require('@/lib/fetchWithLimit');

    await expect(fetchWithLimit('https://images.example/hero.jpg')).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Feed URL not allowed'),
    });
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it('uses a validated lookup for the actual image request', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mockHttpsRequest.mockImplementation((_url, options, callback) => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = 200;
      response.headers = { 'content-type': 'image/png' };

      return createMockRequest(() => {
        expect(options.lookup).toEqual(expect.any(Function));
        callback(response);
        response.end(Buffer.from('png'));
      });
    });

    const { fetchWithLimit } = require('@/lib/fetchWithLimit');

    await expect(fetchWithLimit('https://images.example/hero.jpg')).resolves.toMatchObject({
      ok: true,
      status: 200,
    });
  });

  it('rejects hexadecimal IPv4-mapped IPv6 private DNS results', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:a9fe:a9fe', family: 6 }]);
    const { fetchWithLimit } = require('@/lib/fetchWithLimit');

    await expect(fetchWithLimit('https://images.example/hero.jpg')).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Feed URL not allowed'),
    });
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });
});
