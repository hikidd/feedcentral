import { NextRequest } from 'next/server';

const mockArticleFindMany = jest.fn();
const mockArticleUpdateMany = jest.fn();
const mockArticleUpdate = jest.fn();
const mockArticleDeleteMany = jest.fn();
const mockUserArticleFindMany = jest.fn();
const mockUserArticleUpdateMany = jest.fn();
const mockUserArticleUpdate = jest.fn();
const mockUserArticleDeleteMany = jest.fn();
const mockBookmarkDeleteMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: mockArticleFindMany,
      updateMany: mockArticleUpdateMany,
      update: mockArticleUpdate,
      deleteMany: mockArticleDeleteMany,
    },
    userArticle: {
      findMany: mockUserArticleFindMany,
      updateMany: mockUserArticleUpdateMany,
      update: mockUserArticleUpdate,
      deleteMany: mockUserArticleDeleteMany,
    },
    bookmark: {
      deleteMany: mockBookmarkDeleteMany,
    },
    $transaction: mockTransaction,
  },
}));

jest.mock('@/lib/env', () => ({
  getCronApiKey: () => 'test-cron-key',
}));

let GET: typeof import('@/app/api/cron/cleanup-articles/route').GET;

describe('GET /api/cron/cleanup-articles', () => {
  beforeAll(async () => {
    ({ GET } = await import('@/app/api/cron/cleanup-articles/route'));
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T12:00:00.000Z'));
    jest.clearAllMocks();

    mockArticleFindMany
      .mockResolvedValueOnce([{ id: 'old-unbookmarked' }])
      .mockResolvedValueOnce([
        {
          id: 'bookmarked-8d',
          title: 'Bookmarked Article',
          description: 'Description',
          url: 'https://example.com/bookmarked',
          imageUrl: null,
          author: null,
          publishedAt: new Date('2026-04-30T12:00:00.000Z'),
          source: { name: 'Example', url: 'https://example.com' },
          category: { name: 'Tech', slug: 'tech' },
        },
      ]);
    mockArticleUpdateMany.mockResolvedValue({ count: 1 });
    mockArticleUpdate.mockResolvedValue({});
    mockArticleDeleteMany.mockResolvedValue({ count: 2 });

    mockUserArticleFindMany
      .mockResolvedValueOnce([{ id: 'user-old-unbookmarked' }])
      .mockResolvedValueOnce([{ id: 'user-bookmarked-8d' }])
      .mockResolvedValueOnce([{ id: 'expired-user-article' }])
      .mockResolvedValueOnce([]);
    mockUserArticleUpdateMany.mockResolvedValue({ count: 1 });
    mockUserArticleUpdate.mockResolvedValue({});
    mockUserArticleDeleteMany.mockResolvedValue({ count: 1 });
    mockBookmarkDeleteMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(async (operations) => Promise.all(operations));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects bearer undefined when CRON_SECRET is not configured', async () => {
    const originalCronSecret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    try {
      const request = new NextRequest('http://localhost:3000/api/cron/cleanup-articles', {
        headers: {
          authorization: 'Bearer undefined',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(mockArticleFindMany).not.toHaveBeenCalled();
    } finally {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it('hard-deletes every RSS article older than 14 days, including bookmarked articles', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/cleanup-articles', {
      headers: {
        authorization: 'Bearer test-cron-key',
      },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    const publicHardDeleteWhere = mockArticleDeleteMany.mock.calls[0][0].where;
    expect(publicHardDeleteWhere).not.toHaveProperty('bookmarks');
    expect(publicHardDeleteWhere.publishedAt.lt.toISOString()).toBe('2026-04-24T12:00:00.000Z');

    expect(mockUserArticleFindMany.mock.calls[2][0]).toEqual({
      where: {
        publishedAt: { lt: new Date('2026-04-24T12:00:00.000Z') },
      },
      select: { id: true },
      take: 1000,
    });
    expect(mockUserArticleFindMany.mock.calls[3][0]).toEqual({
      where: {
        publishedAt: { lt: new Date('2026-04-24T12:00:00.000Z') },
      },
      select: { id: true },
      take: 1000,
    });
    expect(mockBookmarkDeleteMany).toHaveBeenCalledWith({
      where: {
        userArticleId: { in: ['expired-user-article'] },
      },
    });
    expect(mockUserArticleDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['expired-user-article'] },
      },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('only archives bookmarked public articles during the 7-to-14-day retention window', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/cleanup-articles', {
      headers: {
        authorization: 'Bearer test-cron-key',
      },
    });

    await GET(request);

    expect(mockArticleFindMany.mock.calls[1][0].where.publishedAt).toEqual({
      lt: new Date('2026-05-01T12:00:00.000Z'),
      gte: new Date('2026-04-24T12:00:00.000Z'),
    });
    expect(mockUserArticleFindMany.mock.calls[1][0].where.publishedAt).toEqual({
      lt: new Date('2026-05-01T12:00:00.000Z'),
      gte: new Date('2026-04-24T12:00:00.000Z'),
    });
  });
});
