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

const ARTICLE_ID = 'cm9oczn8w000008l3d4r6f4tt';
const USER_ARTICLE_ID = 'cm9oczn8w000018l3d4r6f4tt';
const MISSING_ARTICLE_ID = 'cm9oczn8w000028l3d4r6f4tt';
const DELETED_ARTICLE_ID = 'cm9oczn8w000038l3d4r6f4tt';
const ERROR_ARTICLE_ID = 'cm9oczn8w000048l3d4r6f4tt';

describe('GET /api/articles/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('should return a default article by ID', async () => {
    const mockArticle = {
      id: ARTICLE_ID,
      title: 'Test Article',
      description: 'Test description',
      url: 'https://example.com/article',
      publishedAt: new Date('2025-01-01'),
      source: { id: 's1', name: 'Test Source', url: 'https://example.com', logoUrl: null },
      category: { id: 'c1', name: 'Tech', slug: 'tech', color: '#000', icon: 'cpu' },
    };

    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(mockArticle);

    const request = createMockRequest(`http://localhost:3000/api/articles/${ARTICLE_ID}`);
    const response = await GET(request, { params: createMockParams({ id: ARTICLE_ID }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe('Test Article');
    expect(data.data.source.name).toBe('Test Source');
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=1800');
  });

  it('should return 404 when the article is not a public article', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(null);

    const request = createMockRequest(`http://localhost:3000/api/articles/${USER_ARTICLE_ID}`);
    const response = await GET(request, { params: createMockParams({ id: USER_ARTICLE_ID }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Article not found');
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(mockPrisma.userArticle.findFirst).not.toHaveBeenCalled();
  });

  it('should return 404 if public article is not found', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(null);

    const request = createMockRequest(`http://localhost:3000/api/articles/${MISSING_ARTICLE_ID}`);
    const response = await GET(request, { params: createMockParams({ id: MISSING_ARTICLE_ID }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Article not found');
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
  });

  it.each(['a'.repeat(129), 'article-123'])('should return 404 for invalid article ID %s without querying', async (invalidId) => {
    const request = createMockRequest(`http://localhost:3000/api/articles/${invalidId}`);
    const response = await GET(request, { params: createMockParams({ id: invalidId }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Article not found');
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(mockPrisma.article.findFirst).not.toHaveBeenCalled();
  });

  it('should exclude soft-deleted articles', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(null);

    const request = createMockRequest(`http://localhost:3000/api/articles/${DELETED_ARTICLE_ID}`);
    await GET(request, { params: createMockParams({ id: DELETED_ARTICLE_ID }) });

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

    const request = createMockRequest(`http://localhost:3000/api/articles/${ERROR_ARTICLE_ID}`);
    const response = await GET(request, { params: createMockParams({ id: ERROR_ARTICLE_ID }) });
    const { status, data } = await getResponseData(response);

    expect(status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch article');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
