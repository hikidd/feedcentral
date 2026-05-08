jest.mock('@/lib/rss-fetch', () => ({
  fetchRssXml: jest.fn(),
  ensureUrlAllowed: jest.fn(),
}));

const { fetchRssXml } = require('@/lib/rss-fetch');
const mockFetchRssXml = fetchRssXml as jest.Mock;

beforeEach(() => {
  mockFetchRssXml.mockReset();
});

describe('RSS feed article URL validation', () => {
  test('drops public feed articles with unsafe links', async () => {
    mockFetchRssXml.mockResolvedValue('<rss />');
    const { RSSFeedParser } = require('@/lib/rss-parser');
    const parser = new RSSFeedParser() as any;
    parser.parser = {
      parseString: jest.fn().mockResolvedValue({
        items: [
          { title: 'Unsafe', link: 'javascript:alert(1)', pubDate: '2026-05-01T00:00:00.000Z' },
          { title: 'Safe', link: '/safe-post', pubDate: '2026-05-02T00:00:00.000Z' },
        ],
      }),
    };

    const articles = await parser.fetchFeed('https://publisher.example/feed.xml');

    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Safe');
    expect(articles[0].url).toBe('https://publisher.example/safe-post');
  });

  test('drops user feed articles with unsafe links', async () => {
    mockFetchRssXml.mockResolvedValue('<rss />');
    const { UserRSSFeedParser } = require('@/lib/user-rss-parser');
    const parser = new UserRSSFeedParser() as any;
    parser.parser = {
      parseString: jest.fn().mockResolvedValue({
        items: [
          { title: 'Unsafe', link: 'data:text/html,<script>alert(1)</script>', pubDate: '2026-05-01T00:00:00.000Z' },
          { title: 'Safe', link: 'https://publisher.example/safe-post', pubDate: '2026-05-02T00:00:00.000Z' },
        ],
      }),
    };

    const articles = await parser.fetchFeed('https://publisher.example/feed.xml');

    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Safe');
    expect(articles[0].url).toBe('https://publisher.example/safe-post');
  });
});

describe('RSSFeedParser sanitizeHtml', () => {
  function sanitize(html: string, baseUrl?: string) {
    const { RSSFeedParser } = require('@/lib/rss-parser');
    const parser = new RSSFeedParser() as any;
    return parser.sanitizeHtml(html, baseUrl);
  }

  test('keeps article body images without host allowlist checks', () => {
    const result = sanitize('<p>Hello</p><img src="https://media.example.com/image.jpg" alt="hero" />');

    expect(result).toContain('<img');
    expect(result).toContain('src="https://media.example.com/image.jpg"');
    expect(result).toContain('alt="hero"');
  });

  test('rebases relative article body images to the article origin', () => {
    const result = sanitize('<p>Hello</p><img src="/images/hero.jpg" alt="hero" />', 'https://publisher.example/posts/hello');

    expect(result).toContain('<img');
    expect(result).toContain('src="https://publisher.example/images/hero.jpg"');
  });

  test('removes relative images when no base url is available', () => {
    const result = sanitize('<p>Hello</p><img src="/images/hero.jpg" alt="hero" />');

    expect(result).toBe('<p>Hello</p>');
  });

  test('removes images with dangerous schemes', () => {
    const result = sanitize('<p>Hello</p><img src="javascript:alert(1)" alt="x" />');

    expect(result).toBe('<p>Hello</p>');
  });

  test('removes images pointing to localhost', () => {
    const result = sanitize('<p>Hello</p><img src="http://127.0.0.1/pixel.png" alt="x" />');

    expect(result).toBe('<p>Hello</p>');
  });
});

describe('fetchAndStoreArticles cache warmup', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('warms feed caches for articles created by a public RSS fetch', async () => {
    const mockLookup = jest.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const mockRefreshFeedCacheForArticles = jest.fn().mockResolvedValue(undefined);
    const mockPrisma = {
      feedJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      source: {
        update: jest.fn().mockResolvedValue({}),
      },
      article: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { id: 'carticle0000000000000000001', category: { slug: 'tech' } },
          ]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    jest.doMock('dns/promises', () => ({
      __esModule: true,
      default: { lookup: mockLookup },
      lookup: mockLookup,
    }));
    jest.doMock('rss-parser', () => jest.fn().mockImplementation(() => ({
      parseString: jest.fn().mockResolvedValue({
        items: [
          {
            title: 'New article',
            link: 'https://publisher.example/new-article',
            pubDate: '2026-05-01T00:00:00.000Z',
          },
        ],
      }),
    })));
    jest.doMock('@/lib/prisma', () => ({ prisma: mockPrisma }));
    jest.doMock('@/lib/rss-fetch', () => ({
      fetchRssXml: jest.fn().mockResolvedValue('<rss />'),
      ensureUrlAllowed: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('@/lib/feed/cache-warmup', () => ({
      refreshFeedCacheForArticles: mockRefreshFeedCacheForArticles,
    }));

    const { fetchAndStoreArticles } = require('@/lib/rss-parser');

    const result = await fetchAndStoreArticles({
      id: 'source-1',
      name: 'Publisher',
      feedUrl: 'https://publisher.example/feed.xml',
      categoryId: 'category-1',
    });

    expect(result).toEqual({ found: 1, added: 1 });
    expect(mockPrisma.article.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(mockRefreshFeedCacheForArticles).toHaveBeenCalledWith([
      { id: 'carticle0000000000000000001', category: { slug: 'tech' } },
    ]);
  });

  it('does not warm caches when a public RSS fetch creates no articles', async () => {
    const mockLookup = jest.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const mockRefreshFeedCacheForArticles = jest.fn().mockResolvedValue(undefined);
    const mockPrisma = {
      feedJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      source: {
        update: jest.fn().mockResolvedValue({}),
      },
      article: {
        findMany: jest.fn().mockResolvedValueOnce([{ url: 'https://publisher.example/existing' }]),
        createMany: jest.fn(),
      },
    };

    jest.doMock('dns/promises', () => ({
      __esModule: true,
      default: { lookup: mockLookup },
      lookup: mockLookup,
    }));
    jest.doMock('rss-parser', () => jest.fn().mockImplementation(() => ({
      parseString: jest.fn().mockResolvedValue({
        items: [
          {
            title: 'Existing article',
            link: 'https://publisher.example/existing',
            pubDate: '2026-05-01T00:00:00.000Z',
          },
        ],
      }),
    })));
    jest.doMock('@/lib/prisma', () => ({ prisma: mockPrisma }));
    jest.doMock('@/lib/rss-fetch', () => ({
      fetchRssXml: jest.fn().mockResolvedValue('<rss />'),
      ensureUrlAllowed: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('@/lib/feed/cache-warmup', () => ({
      refreshFeedCacheForArticles: mockRefreshFeedCacheForArticles,
    }));

    const { fetchAndStoreArticles } = require('@/lib/rss-parser');

    const result = await fetchAndStoreArticles({
      id: 'source-1',
      name: 'Publisher',
      feedUrl: 'https://publisher.example/feed.xml',
      categoryId: 'category-1',
    });

    expect(result).toEqual({ found: 1, added: 0 });
    expect(mockPrisma.article.createMany).not.toHaveBeenCalled();
    expect(mockRefreshFeedCacheForArticles).not.toHaveBeenCalled();
  });
});
