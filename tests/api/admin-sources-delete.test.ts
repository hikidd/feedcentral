/**
 * Tests for /api/admin/sources/[id]
 */

import { DELETE as deleteSource } from '@/app/api/admin/sources/[id]/route';
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

describe('DELETE /api/admin/sources/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'DELETE',
    });

    const response = await deleteSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Authentication required');
    expect(mockPrisma.source.delete).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'DELETE',
      userId: 'user123',
      role: 'USER',
    });

    const response = await deleteSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Admin access required');
    expect(mockPrisma.source.delete).not.toHaveBeenCalled();
  });

  it('deletes a source successfully for admin', async () => {
    mockPrisma.source.delete.mockResolvedValue({ id: 'source1' });

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'DELETE',
      userId: 'admin123',
      role: 'ADMIN',
    });

    const response = await deleteSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Source deleted successfully');
    expect(mockPrisma.source.delete).toHaveBeenCalledWith({
      where: { id: 'source1' },
    });
  });

  it('returns 404 when source does not exist', async () => {
    const error = new Error('Record to delete does not exist.') as Error & { code?: string };
    error.code = 'P2025';
    mockPrisma.source.delete.mockRejectedValue(error);

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'DELETE',
      userId: 'admin123',
      role: 'ADMIN',
    });

    const response = await deleteSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Source not found');
  });

  it('returns 500 without leaking internal error details', async () => {
    mockPrisma.source.delete.mockRejectedValue(new Error('Foreign key constraint failed on the field: article_sourceId_fkey'));

    const request = createMockRequest('http://localhost:3000/api/admin/sources/source1', {
      method: 'DELETE',
      userId: 'admin123',
      role: 'ADMIN',
    });

    const response = await deleteSource(request, { params: createMockParams({ id: 'source1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to delete source');
    expect(data.message).toBeUndefined();
  });
});
