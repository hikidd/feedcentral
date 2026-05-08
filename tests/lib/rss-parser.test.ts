describe('RSS feed article URL validation', () => {
  test('drops public feed articles with unsafe links', async () => {
    const { RSSFeedParser } = require('@/lib/rss-parser');
    const parser = new RSSFeedParser() as any;
    parser.parser = {
      parseURL: jest.fn().mockResolvedValue({
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
    const { UserRSSFeedParser } = require('@/lib/user-rss-parser');
    const parser = new UserRSSFeedParser() as any;
    parser.parser = {
      parseURL: jest.fn().mockResolvedValue({
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
