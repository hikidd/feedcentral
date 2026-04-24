/**
 * Tests for /api/articles/[id]
 * Single public article endpoint
 */

import { GET } from '@/app/api/articles/[id]/route';
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

describe('GET /api/articles/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('should return a default article by ID', async () => {
    const mockArticle = {
      id: 'article1',
      title: 'Test Article',
      description: 'Test description',
      url: 'https://example.com/article',
      publishedAt: new Date('2025-01-01'),
      source: { id: 's1', name: 'Test Source', url: 'https://example.com', logoUrl: null },
      category: { id: 'c1', name: 'Tech', slug: 'tech', color: '#000', icon: 'cpu' },
    };

    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(mockArticle);

    const request = createMockRequest('http://localhost:3000/api/articles/article1');
    const response = await GET(request, { params: createMockParams({ id: 'article1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe('Test Article');
    expect(data.data.source.name).toBe('Test Source');
  });

  it('should return 404 when the article is not a public article', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/articles/user-article1');
    const response = await GET(request, { params: createMockParams({ id: 'user-article1' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Article not found');
    expect(mockPrisma.userArticle.findFirst).not.toHaveBeenCalled();
  });

  it('should return 404 if public article is not found', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/articles/nonexistent');
    const response = await GET(request, { params: createMockParams({ id: 'nonexistent' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Article not found');
  });

  it('should exclude soft-deleted articles', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/articles/deleted-article');
    await GET(request, { params: createMockParams({ id: 'deleted-article' }) });

    expect(mockPrisma.article.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
        }),
      })
    );
  });

  it('should handle database errors', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'));

    const request = createMockRequest('http://localhost:3000/api/articles/error-test');
    const response = await GET(request, { params: createMockParams({ id: 'error-test' }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch article');
  });
});
