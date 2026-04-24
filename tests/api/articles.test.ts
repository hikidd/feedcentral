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
  });

  describe('Anonymous User', () => {
    it('should return paginated articles for anonymous users', async () => {
      // Mock data
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

      (mockPrisma.article.count as jest.Mock).mockResolvedValue(1);
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
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should filter articles by category', async () => {
      (mockPrisma.article.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { category: 'tech' },
      });
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(200);
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: { slug: 'tech' },
          }),
        })
      );
    });

    it('should handle pagination parameters', async () => {
      (mockPrisma.article.count as jest.Mock).mockResolvedValue(100);
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { page: '2', pageSize: '10' },
      });
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(200);
      expect(data.pagination.page).toBe(2);
      expect(data.pagination.pageSize).toBe(10);
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
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

      (mockPrisma.article.count as jest.Mock).mockResolvedValue(1);
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
      (mockPrisma.article.count as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = createMockRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const { status, data } = await getResponseData(response);

      expect(status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch articles');
    });
  });
});
