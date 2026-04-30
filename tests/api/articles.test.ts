/**
 * Tests for /api/articles
 * Main public feed endpoint that returns articles with pagination and filtering
 */

import { GET } from '@/app/api/articles/route';
import { createMockRequest, getResponseData } from '../helpers/test-utils';
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

describe('GET /api/articles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  describe('Anonymous User', () => {
    it('should return paginated articles for anonymous users', async () => {
      const mockArticles = [
        {
          id: '1',
          title: 'Test Article 1',
          description: 'Description 1',
          url: 'https://example.com/1',
          publishedAt: new Date('2025-01-01'),
          source: { id: 's1', name: 'Test Source', url: 'https://example.com', logoUrl: null },
          category: { id: 'c1', name: 'Tech', slug: 'tech', color: '#000', icon: 'cpu' },
        },
      ];

      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const request = createMockRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].title).toBe('Test Article 1');
      expect(data.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: null,
        totalPages: null,
        hasNext: false,
        hasPrev: false,
      });
      expect(mockPrisma.article.count).not.toHaveBeenCalled();
    });

    it('should filter articles by category', async () => {
      (mockPrisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'cat-tech' });
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { category: 'tech' },
      });
      const response = await GET(request);
      const { status } = await getResponseData(response);

      expect(status).toBe(200);
      expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
        where: { slug: 'tech' },
        select: { id: true },
      });
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 'cat-tech',
          }),
        })
      );
    });

    it('should fetch one extra record to determine hasNext', async () => {
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([
        { id: '1', title: 'A' },
        { id: '2', title: 'B' },
        { id: '3', title: 'C' },
      ]);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { page: '1', pageSize: '2' },
      });
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(200);
      expect(data.data).toHaveLength(2);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.pageSize).toBe(2);
      expect(data.pagination.hasNext).toBe(true);
      expect(data.pagination.hasPrev).toBe(false);
      expect(data.pagination.total).toBeNull();
      expect(data.pagination.totalPages).toBeNull();
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 3,
        })
      );
    });

    it('should mark the last page without using count', async () => {
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([
        { id: '3', title: 'C' },
      ]);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { page: '2', pageSize: '2' },
      });
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.pagination.hasNext).toBe(false);
      expect(data.pagination.hasPrev).toBe(true);
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 2,
          take: 3,
        })
      );
      expect(mockPrisma.article.count).not.toHaveBeenCalled();
    });
  });

  describe('Authenticated Requests', () => {
    it('should return the same public feed for authenticated requests', async () => {
      const mockArticles = [
        {
          id: '1',
          title: 'Default Article',
          description: 'Description 1',
          url: 'https://example.com/1',
          publishedAt: new Date('2025-01-02'),
          source: { id: 's1', name: 'Default Source', url: 'https://example.com', logoUrl: null },
          category: { id: 'c1', name: 'Tech', slug: 'tech', color: '#000', icon: 'cpu' },
        },
      ];

      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        userId: 'user123',
      });
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].title).toBe('Default Article');
      expect(mockPrisma.userSource.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.userSourcePreference.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.userArticle.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.userArticle.count).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (mockPrisma.article.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = createMockRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch articles');
    });
  });
});
