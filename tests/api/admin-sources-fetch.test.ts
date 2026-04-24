/**
 * Tests for /api/admin/sources/[id]/fetch
 */

import { POST as sourceFetch } from '@/app/api/admin/sources/[id]/fetch/route';
import { createMockRequest, getResponseData, createMockParams } from '../helpers/test-utils';
import { resetAllMocks } from '../helpers/prisma-mock';

jest.mock('@/lib/prisma', () => {
  const { mockPrisma } = require('../helpers/prisma-mock');
  return {
    __esModule: true,
    prisma: mockPrisma,
    default: mockPrisma,
  };
});

const mockFetchSingleSource = jest.fn();
jest.mock('@/lib/rss-parser', () => ({
  __esModule: true,
  fetchSingleSource: (...args: any[]) => mockFetchSingleSource(...args),
}));

describe('POST /api/admin/sources/[id]/fetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1/fetch', {
      method: 'POST',
    });

    const response = await sourceFetch(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Authentication required');
    expect(mockFetchSingleSource).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1/fetch', {
      method: 'POST',
      userId: 'user123',
      role: 'USER',
    });

    const response = await sourceFetch(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Admin access required');
    expect(mockFetchSingleSource).not.toHaveBeenCalled();
  });

  it('fetches a source successfully for admin', async () => {
    mockFetchSingleSource.mockResolvedValue({
      found: 12,
      added: 5,
    });

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1/fetch', {
      method: 'POST',
      userId: 'admin123',
      role: 'ADMIN',
    });

    const response = await sourceFetch(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({ found: 12, added: 5 });
    expect(mockFetchSingleSource).toHaveBeenCalledWith('source1');
  });

  it('returns 404 when source does not exist', async () => {
    const error = new Error('Source source1 not found') as Error & { code?: string };
    error.code = 'SOURCE_NOT_FOUND';
    mockFetchSingleSource.mockRejectedValue(error);

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1/fetch', {
      method: 'POST',
      userId: 'admin123',
      role: 'ADMIN',
    });

    const response = await sourceFetch(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Source not found');
  });

  it('returns 400 when source is inactive', async () => {
    const error = new Error('Source 36kr is not active') as Error & { code?: string };
    error.code = 'SOURCE_INACTIVE';
    mockFetchSingleSource.mockRejectedValue(error);

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1/fetch', {
      method: 'POST',
      userId: 'admin123',
      role: 'ADMIN',
    });

    const response = await sourceFetch(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Source is inactive');
  });

  it('returns 500 when fetch fails unexpectedly', async () => {
    mockFetchSingleSource.mockRejectedValue(new Error('Timed out while parsing feed'));

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1/fetch', {
      method: 'POST',
      userId: 'admin123',
      role: 'ADMIN',
    });

    const response = await sourceFetch(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch source');
    expect(data.message).toBeUndefined();
  });
});
