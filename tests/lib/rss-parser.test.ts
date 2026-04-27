describe('RSSFeedParser sanitizeHtml', () => {
  function sanitize(html: string) {
    const { RSSFeedParser } = require('@/lib/rss-parser');
    const parser = new RSSFeedParser() as any;
    return parser.sanitizeHtml(html);
  }

  test('keeps article body images without host allowlist checks', () => {
    const result = sanitize('<p>Hello</p><img src="https://media.example.com/image.jpg" alt="hero" />');

    expect(result).toContain('<img');
    expect(result).toContain('src="https://media.example.com/image.jpg"');
    expect(result).toContain('alt="hero"');
  });

  test('keeps relative article body images', () => {
    const result = sanitize('<p>Hello</p><img src="/images/hero.jpg" alt="hero" />');

    expect(result).toContain('<img');
    expect(result).toContain('src="/images/hero.jpg"');
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
