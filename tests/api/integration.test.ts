/**
 * Integration Tests
 * Test complete workflows across multiple API endpoints
 */

import { createMockRequest, getResponseData, createMockParams } from '../helpers/test-utils';
import { resetAllMocks } from '../helpers/prisma-mock';

// Import all route handlers
import { POST as login } from '@/app/api/auth/login/route';
import { GET as getSources } from '@/app/api/user/sources/route';
import { POST as createSource } from '@/app/api/user/sources/route';
import { POST as refreshSource } from '@/app/api/user/sources/[id]/refresh/route';
import { PATCH as togglePreference } from '@/app/api/user/source-preferences/route';
import { GET as getArticles } from '@/app/api/articles/route';

jest.mock('@/lib/prisma', () => {
  const { mockPrisma } = require('../helpers/prisma-mock');
  return {
    __esModule: true,
    prisma: mockPrisma,
    default: mockPrisma,
  };
});
jest.mock('bcryptjs');

// Mock RSS parser module
const mockFetchAndStoreUserArticles = jest.fn();
const mockValidateRSSFeed = jest.fn();
jest.mock('@/lib/rss-parser', () => ({
  __esModule: true,
  fetchAndStoreUserArticles: (...args: any[]) => mockFetchAndStoreUserArticles(...args),
  validateRSSFeed: (...args: any[]) => mockValidateRSSFeed(...args),
}));

const { mockPrisma } = require('./../../tests/helpers/prisma-mock');

describe('Integration: Complete User Workflow', () => {
  const mockUserId = 'integration-user-123';
  const mockSourceId = 'custom-source-1';
  
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('should complete full custom source workflow', async () => {
    // Mock the user
    const mockUser = {
      id: mockUserId,
      email: 'integration@example.com',
      premiumTier: 'free',
    };
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    // Step 1: User creates a custom source
    const mockNewSource = {
      id: mockSourceId,
      userId: mockUserId,
      feedUrl: 'https://example.com/feed.xml',
      customName: 'My Custom Feed',
      isEnabled: true,
      categoryId: 'cat-tech',
      articleCount: 0,
      category: {
        id: 'cat-tech',
        name: 'Tech',
        slug: 'tech',
      },
    };

    (mockPrisma.userSource.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.userSource.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.userSource.create as jest.Mock).mockResolvedValue(mockNewSource);

    // Mock RSS feed validation
    mockValidateRSSFeed.mockResolvedValue({
      isValid: true,
      feedTitle: 'My Custom Feed',
      feedDescription: 'A custom RSS feed',
      siteUrl: 'https://example.com',
    });

    const createRequest = createMockRequest('http://localhost:3000/api/user/sources', {
      method: 'POST',
      userId: mockUserId,
      body: {
        feedUrl: 'https://example.com/feed.xml',
        customName: 'My Custom Feed',
        categoryId: 'cat-tech',
      },
    });

    const createResponse = await createSource(createRequest);
    const { status: createStatus, data: createData } = await getResponseData(createResponse);

    expect(createStatus).toBe(201);
    expect(createData.message).toBeDefined();
    expect(createData.source.id).toBe(mockSourceId);

    // Step 2: User refreshes the custom source
    const mockRefreshedSource = {
      ...mockNewSource,
      articleCount: 15,
    };

    (mockPrisma.userSource.findUnique as jest.Mock).mockResolvedValue(mockRefreshedSource);
    
    // Mock the RSS fetch function
    mockFetchAndStoreUserArticles.mockResolvedValue({ found: 15, added: 15 });

    const refreshRequest = createMockRequest(
      `http://localhost:3000/api/user/sources/${mockSourceId}/refresh`,
      {
        method: 'POST',
        userId: mockUserId,
      }
    );

    const refreshResponse = await refreshSource(refreshRequest, {
      params: createMockParams({ id: mockSourceId }),
    });
    const { status: refreshStatus, data: refreshData } = await getResponseData(refreshResponse);

    expect(refreshStatus).toBe(200);
    expect(refreshData.message).toBeDefined();

    // Step 3: User toggles off a default source
    // Re-mock the user for this step
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    // Mock the source being toggled
    const mockDefaultSource = {
      id: 'default-source-1',
      name: 'Default Source',
      isActive: true,
    };
    (mockPrisma.source.findUnique as jest.Mock).mockResolvedValue(mockDefaultSource);

    const mockPreference = {
      id: 'pref-1',
      userId: mockUserId,
      sourceId: 'default-source-1',
      isEnabled: false,
    };

    (mockPrisma.userSourcePreference.upsert as jest.Mock).mockResolvedValue(mockPreference);

    const toggleRequest = createMockRequest('http://localhost:3000/api/user/source-preferences', {
      method: 'PATCH',
      userId: mockUserId,
      body: {
        sourceId: 'default-source-1',
        isEnabled: false,
      },
    });

    const toggleResponse = await togglePreference(toggleRequest);
    const { status: toggleStatus, data: toggleData } = await getResponseData(toggleResponse);

    expect(toggleStatus).toBe(200);
    expect(toggleData.message).toBeDefined();
    expect(toggleData.preference.isEnabled).toBe(false);

    // Step 4: User fetches the public feed
    const mockArticles = [
      {
        id: 'article-1',
        title: 'Default Article',
        publishedAt: new Date('2025-01-01'),
        source: { name: 'Default Source' },
      },
    ];

    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const feedRequest = createMockRequest('http://localhost:3000/api/articles', {
      userId: mockUserId,
      searchParams: { page: '1', pageSize: '20' },
    });

    const feedResponse = await getArticles(feedRequest);
    const { status: feedStatus, data: feedData } = await getResponseData(feedResponse);

    expect(feedStatus).toBe(200);
    expect(feedData.success).toBe(true);
    expect(feedData.data).toHaveLength(1);
    expect(feedData.pagination.total).toBeNull();
    expect(feedData.pagination.hasNext).toBe(false);
    expect(mockPrisma.userSource.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.userSourcePreference.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.userArticle.findMany).not.toHaveBeenCalled();
  });

  it('should handle anonymous user viewing public feed', async () => {
    // Anonymous user should see all default sources
    (mockPrisma.article.count as jest.Mock).mockResolvedValue(100);
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'article-1',
        title: 'Public Article',
        source: { name: 'Public Source' },
      },
    ]);

    const request = createMockRequest('http://localhost:3000/api/articles');
    const response = await getArticles(request);
    const { status, data } = await getResponseData(response);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    
    // Should not filter any sources
    expect(mockPrisma.userSource?.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.userSourcePreference?.findMany).not.toHaveBeenCalled();
  });

  it('should enforce source limit per user', async () => {
    // Mock the user
    const mockUser = {
      id: mockUserId,
      email: 'integration@example.com',
      premiumTier: 'free',
    };
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    // User already has 10 sources
    (mockPrisma.userSource.count as jest.Mock).mockResolvedValue(10);

    const request = createMockRequest('http://localhost:3000/api/user/sources', {
      method: 'POST',
      userId: mockUserId,
      body: {
        feedUrl: 'https://example.com/feed11.xml',
        customName: 'Feed #11',
      },
    });

    const response = await createSource(request);
    const { status, data } = await getResponseData(response);

    expect(status).toBe(403);
    expect(data.error).toBeDefined();
    expect(data.error).toContain('Free tier limit reached');
  });

  it('should prevent duplicate feed URLs', async () => {
    // Mock the user
    const mockUser = {
      id: mockUserId,
      email: 'integration@example.com',
      premiumTier: 'free',
    };
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    (mockPrisma.userSource.count as jest.Mock).mockResolvedValue(5);
    (mockPrisma.userSource.findFirst as jest.Mock).mockResolvedValue({
      id: 'existing-source',
      feedUrl: 'https://example.com/feed.xml',
    });

    const request = createMockRequest('http://localhost:3000/api/user/sources', {
      method: 'POST',
      userId: mockUserId,
      body: {
        feedUrl: 'https://example.com/feed.xml',
        customName: 'Duplicate Feed',
      },
    });

    const response = await createSource(request);
    const { status, data } = await getResponseData(response);

    expect(status).toBe(409);
    expect(data.error).toBeDefined();
    expect(data.error).toContain('already added');
  });
});

describe('Integration: Public Feed Pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('should preserve chronological order for public feed results', async () => {
    const defaultArticles = [
      {
        id: 'default-2',
        title: 'New Default Article',
        publishedAt: new Date('2025-01-03T10:00:00Z'),
        source: { name: 'Default Source' },
        category: { name: 'Tech' },
      },
      {
        id: 'default-1',
        title: 'Old Default Article',
        publishedAt: new Date('2025-01-01T10:00:00Z'),
        source: { name: 'Default Source' },
        category: { name: 'Tech' },
      },
    ];

    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(defaultArticles);

    const request = createMockRequest('http://localhost:3000/api/articles', {
      userId: 'user-merge-test',
      searchParams: { pageSize: '10' },
    });

    const response = await getArticles(request);
    const { status, data } = await getResponseData(response);

    expect(status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.data[0].title).toContain('New Default');
    expect(data.data[1].title).toContain('Old Default');
    expect(data.pagination.hasNext).toBe(false);
  });
});
