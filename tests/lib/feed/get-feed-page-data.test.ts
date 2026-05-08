import { hostname } from 'os';
import { getFeedCategoryStaticParams, getFeedPageData, isValidFeedCategorySlug } from '@/lib/feed/get-feed-page-data';
import { resetAllMocks } from '../../helpers/prisma-mock';

jest.mock('@/lib/prisma', () => {
  const { mockPrisma } = require('../../helpers/prisma-mock');
  return {
    __esModule: true,
    prisma: mockPrisma,
    default: mockPrisma,
  };
});

const { mockPrisma } = require('../../../tests/helpers/prisma-mock');
const originalEnv = { ...process.env };

function article(id: string, publishedAt: string) {
  return {
    id,
    title: `Article ${id}`,
    publishedAt: new Date(publishedAt),
    source: { id: 'source-1', name: 'Source', url: 'https://example.com', logoUrl: null },
    category: { id: 'cat-tech', name: 'Tech', slug: 'tech', color: '#000', icon: 'cpu' },
  };
}

describe('getFeedPageData', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    resetAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads categories and the public first page for the all feed', async () => {
    (mockPrisma.category.findMany as jest.Mock).mockResolvedValue([
      { id: 'cat-tech', name: 'Tech', slug: 'tech', icon: 'cpu', color: '#000', order: 1 },
    ]);
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([
      article('article-1', '2026-05-01T00:00:00.000Z'),
    ]);

    const data = await getFeedPageData();

    expect(data.activeCategory).toBeNull();
    expect(data.categories).toEqual([
      { id: 'cat-tech', name: 'Tech', slug: 'tech', icon: 'cpu', color: '#000', order: 1 },
    ]);
    expect(data.articlesPage.articles).toHaveLength(1);
    expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        color: true,
        order: true,
      },
      orderBy: { order: 'asc' },
    });
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        take: 21,
      })
    );
  });

  it('loads category first-page data and identifies the active category', async () => {
    const categories = [
      { id: 'cat-tech', name: 'Tech', slug: 'tech', icon: 'cpu', color: '#000', order: 1 },
      { id: 'cat-design', name: 'Design', slug: 'design', icon: 'palette', color: '#fff', order: 2 },
    ];
    (mockPrisma.category.findMany as jest.Mock).mockResolvedValue(categories);
    (mockPrisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'cat-tech' });
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([
      article('article-1', '2026-05-01T00:00:00.000Z'),
    ]);

    const data = await getFeedPageData({ category: 'tech' });

    expect(data.activeCategory).toEqual(categories[0]);
    expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
      where: { slug: 'tech' },
      select: { id: true },
    });
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: 'cat-tech' }),
        take: 21,
      })
    );
  });

  it('returns an empty article page for invalid category slugs without querying articles', async () => {
    (mockPrisma.category.findMany as jest.Mock).mockResolvedValue([]);

    const data = await getFeedPageData({ category: '../admin' });

    expect(data.activeCategory).toBeNull();
    expect(data.articlesPage.articles).toEqual([]);
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });

  it('rejects overlong category slugs', () => {
    expect(isValidFeedCategorySlug('a'.repeat(100))).toBe(true);
    expect(isValidFeedCategorySlug('a'.repeat(101))).toBe(false);
  });

  it('loads static category params for known feed categories', async () => {
    (mockPrisma.category.findMany as jest.Mock).mockResolvedValue([
      { slug: 'tech' },
      { slug: 'design' },
      { slug: '../admin' },
    ]);

    await expect(getFeedCategoryStaticParams()).resolves.toEqual([{ category: 'tech' }, { category: 'design' }]);

    expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
      select: { slug: true },
      orderBy: { order: 'asc' },
    });
  });

  it('returns empty static category params locally when explicitly allowed during production build', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
      npm_lifecycle_event: 'build',
      FEED_ALLOW_EMPTY_BUILD_WITHOUT_DATABASE: 'local-only',
      FEED_EMPTY_BUILD_LOCAL_HOSTNAME: hostname(),
    };
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;

    await expect(getFeedCategoryStaticParams()).resolves.toEqual([]);

    expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
  });

  it('returns build-safe empty data locally when explicitly allowed during production build', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
      npm_lifecycle_event: 'build',
      FEED_ALLOW_EMPTY_BUILD_WITHOUT_DATABASE: 'local-only',
      FEED_EMPTY_BUILD_LOCAL_HOSTNAME: hostname(),
    };
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;

    const data = await getFeedPageData();

    expect(data).toEqual({
      categories: [],
      activeCategory: null,
      articlesPage: {
        articles: [],
        page: null,
        pageSize: 20,
        total: null,
        totalPages: null,
        hasNext: false,
        hasPrev: false,
        nextCursor: null,
      },
    });
    expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });

  it('throws on production builds without the explicit local empty-feed opt-in', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
    };
    delete process.env.DATABASE_URL;
    delete process.env.FEED_ALLOW_EMPTY_BUILD_WITHOUT_DATABASE;
    delete process.env.VERCEL;

    await expect(getFeedPageData()).rejects.toThrow('DATABASE_URL must be configured to render feed pages');

    expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });

  it('throws when the local empty-feed opt-in uses an invalid value', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
      FEED_ALLOW_EMPTY_BUILD_WITHOUT_DATABASE: '1',
      FEED_EMPTY_BUILD_LOCAL_HOSTNAME: hostname(),
    };
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;

    await expect(getFeedPageData()).rejects.toThrow('DATABASE_URL must be configured to render feed pages');

    expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });

  it('throws when the local empty-feed opt-in hostname does not match', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
      FEED_ALLOW_EMPTY_BUILD_WITHOUT_DATABASE: 'local-only',
      FEED_EMPTY_BUILD_LOCAL_HOSTNAME: `${hostname()}-different`,
    };
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;

    await expect(getFeedPageData()).rejects.toThrow('DATABASE_URL must be configured to render feed pages');

    expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });

  it('throws on hosted production builds when DATABASE_URL is unavailable', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
      FEED_ALLOW_EMPTY_BUILD_WITHOUT_DATABASE: 'local-only',
      FEED_EMPTY_BUILD_LOCAL_HOSTNAME: hostname(),
      VERCEL: '1',
    };
    delete process.env.DATABASE_URL;

    await expect(getFeedPageData()).rejects.toThrow('DATABASE_URL must be configured to render feed pages');

    expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });
});
