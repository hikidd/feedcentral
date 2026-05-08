import {
  decodeArticleCursor,
  encodeArticleCursor,
  InvalidArticleCursorError,
} from '@/lib/articles/cursor';

describe('article cursor helpers', () => {
  it('round-trips a valid cursor', () => {
    const cursor = encodeArticleCursor({
      publishedAt: new Date('2026-05-01T12:34:56.000Z'),
      id: 'article-123',
    });

    const decoded = decodeArticleCursor(cursor);

    expect(decoded).toEqual({
      publishedAt: new Date('2026-05-01T12:34:56.000Z'),
      id: 'article-123',
    });
  });

  it('round-trips unicode and punctuation in ids', () => {
    const cursor = encodeArticleCursor({
      publishedAt: '2026-05-01T12:34:56.000Z',
      id: '文章:abc/123?x=1',
    });

    expect(decodeArticleCursor(cursor)).toEqual({
      publishedAt: new Date('2026-05-01T12:34:56.000Z'),
      id: '文章:abc/123?x=1',
    });
  });

  it('rejects weak dedicated cursor signing secrets', () => {
    const previousSecret = process.env.ARTICLE_CURSOR_SECRET;
    process.env.ARTICLE_CURSOR_SECRET = 'short';

    try {
      expect(() =>
        encodeArticleCursor({
          publishedAt: '2026-05-01T12:34:56.000Z',
          id: 'article-123',
        })
      ).toThrow('ARTICLE_CURSOR_SECRET must be at least 32 characters');
    } finally {
      if (previousSecret == null) {
        delete process.env.ARTICLE_CURSOR_SECRET;
      } else {
        process.env.ARTICLE_CURSOR_SECRET = previousSecret;
      }
    }
  });

  it('rejects an unsigned client-minted cursor payload', () => {
    const forged = Buffer.from(
      JSON.stringify({
        publishedAt: '2026-05-01T12:34:56.000Z',
        id: 'article-123',
      })
    ).toString('base64url');

    expect(() => decodeArticleCursor(forged)).toThrow(InvalidArticleCursorError);
  });

  it('rejects a tampered server-issued cursor', () => {
    const cursor = encodeArticleCursor({
      publishedAt: '2026-05-01T12:34:56.000Z',
      id: 'article-123',
    });
    const envelope = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const tampered = Buffer.from(
      JSON.stringify({
        ...envelope,
        payload: {
          ...envelope.payload,
          id: 'article-456',
        },
      })
    ).toString('base64url');

    expect(() => decodeArticleCursor(tampered)).toThrow(InvalidArticleCursorError);
  });

  it.each([
    '',
    'not-base64',
    Buffer.from('not-json').toString('base64url'),
    Buffer.from(JSON.stringify({ id: 'article-123' })).toString('base64url'),
    Buffer.from(JSON.stringify({ publishedAt: '2026-05-01T12:34:56.000Z' })).toString('base64url'),
    Buffer.from(JSON.stringify({ publishedAt: 'not-a-date', id: 'article-123' })).toString('base64url'),
    Buffer.from(JSON.stringify({ publishedAt: '2026-05-01T12:34:56Z', id: 'article-123' })).toString('base64url'),
    Buffer.from(JSON.stringify({ publishedAt: '2026-05-01T12:34:56.000Z', id: '' })).toString('base64url'),
    Buffer.from(JSON.stringify({ publishedAt: '2026-05-01T12:34:56.000Z', id: 'a'.repeat(129) })).toString('base64url'),
    Buffer.from(JSON.stringify({ publishedAt: '2026-05-01T12:34:56.000Z', id: 'article-123', extra: true })).toString('base64url'),
    'a'.repeat(1025),
  ])('rejects invalid cursor %s', (cursor) => {
    expect(() => decodeArticleCursor(cursor)).toThrow(InvalidArticleCursorError);
  });
});
