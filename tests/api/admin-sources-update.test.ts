/**
 * Tests for PATCH /api/admin/sources/[id]
 */

import { PATCH as updateSource } from '@/app/api/admin/sources/[id]/route';
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

const { mockPrisma } = require('./../../tests/helpers/prisma-mock');

describe('PATCH /api/admin/sources/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'PATCH',
      body: { name: 'Renamed' },
    });

    const response = await updateSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(401);
    expect(data.success).toBe(false);
    expect(mockPrisma.source.update).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'PATCH',
      userId: 'user123',
      role: 'USER',
      body: { name: 'Renamed' },
    });

    const response = await updateSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(403);
    expect(data.success).toBe(false);
    expect(mockPrisma.source.update).not.toHaveBeenCalled();
  });

  it('updates the editable fields for an admin', async () => {
    mockPrisma.source.update.mockResolvedValue({
      id: 'source1',
      name: 'Linux.do',
      url: 'https://linux.do',
      feedUrl: 'https://linux.do/latest.rss',
      categoryId: 'cat2',
      category: { id: 'cat2', name: 'Technology', color: '#8b5cf6' },
    });

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'PATCH',
      userId: 'admin123',
      role: 'ADMIN',
      body: {
        name: '  Linux.do  ',
        url: 'https://linux.do',
        feedUrl: 'https://linux.do/latest.rss',
        categoryId: 'cat2',
      },
    });

    const response = await updateSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.source.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'source1' },
        data: expect.objectContaining({
          name: 'Linux.do',
          feedUrl: 'https://linux.do/latest.rss',
          categoryId: 'cat2',
        }),
      })
    );
  });

  it('rejects an empty name', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'PATCH',
      userId: 'admin123',
      role: 'ADMIN',
      body: { name: '   ' },
    });

    const response = await updateSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(mockPrisma.source.update).not.toHaveBeenCalled();
  });

  it('rejects a non-http feed URL', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'PATCH',
      userId: 'admin123',
      role: 'ADMIN',
      body: { feedUrl: 'ftp://example.com/feed.xml' },
    });

    const response = await updateSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('feedUrl');
    expect(mockPrisma.source.update).not.toHaveBeenCalled();
  });

  it('returns 409 when the feed URL is already taken', async () => {
    const error = new Error('Unique constraint failed') as Error & { code?: string };
    error.code = 'P2002';
    mockPrisma.source.update.mockRejectedValue(error);

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'PATCH',
      userId: 'admin123',
      role: 'ADMIN',
      body: { feedUrl: 'https://taken.example/feed.xml' },
    });

    const response = await updateSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(409);
    expect(data.success).toBe(false);
  });

  it('returns 404 when the source does not exist', async () => {
    const error = new Error('Record to update not found') as Error & { code?: string };
    error.code = 'P2025';
    mockPrisma.source.update.mockRejectedValue(error);

    const request = createMockRequest('http://localhost:3000/api/admin/sources/missing', {
      method: 'PATCH',
      userId: 'admin123',
      role: 'ADMIN',
      body: { name: 'Renamed' },
    });

    const response = await updateSource(request, { params: createMockParams({ id: 'missing' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
