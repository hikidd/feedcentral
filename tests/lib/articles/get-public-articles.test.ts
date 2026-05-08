import { decodeArticleCursor, encodeArticleCursor } from '@/lib/articles/cursor';
import { getPublicArticles } from '@/lib/articles/get-public-articles';
import { resetAllMocks } from '../../helpers/prisma-mock';

jest.mock('@/lib/prisma', () => {
  const { mockPrisma } = require('../../helpers/prisma-mock');
  return {
    __esModule: true,
    prisma: mockPrisma,
    default: mockPrisma,
  };
});

const { mockPrisma } = require('../../helpers/prisma-mock');

function article(id: string, publishedAt: string) {
  return {
    id,
    title: `Article ${id}`,
    publishedAt: new Date(publishedAt),
    source: { id: 'source-1', name: 'Source', url: 'https://example.com', logoUrl: null },
    category: { id: 'cat-1', name: 'Tech', slug: 'tech', color: '#000', icon: 'cpu' },
  };
}

describe('getPublicArticles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('queries the first page with stable cursor ordering', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([
      article('article-2', '2026-05-02T00:00:00.000Z'),
      article('article-1', '2026-05-01T00:00:00.000Z'),
    ]);

    const result = await getPublicArticles({ pageSize: 20 });

    expect(result.articles).toHaveLength(2);
    expect(result.hasNext).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 21,
      })
    );
    expect(mockPrisma.article.findMany.mock.calls[0][0]).not.toHaveProperty('skip');
    expect(mockPrisma.article.count).not.toHaveBeenCalled();
  });

  it('uses cursor conditions without overwriting category and source filters', async () => {
    (mockPrisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'cat-tech' });
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getPublicArticles({
      category: 'tech',
      sourceId: 'source-1',
      pageSize: 20,
      cursor: encodeArticleCursor({ publishedAt: '2026-05-01T12:00:00.000Z', id: 'article-3' }),
    });

    expect(result.articles).toEqual([]);
    expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
      where: { slug: 'tech' },
      select: { id: true },
    });
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          categoryId: 'cat-tech',
          sourceId: 'source-1',
          OR: [
            { publishedAt: { lt: new Date('2026-05-01T12:00:00.000Z') } },
            {
              publishedAt: new Date('2026-05-01T12:00:00.000Z'),
              id: { lt: 'article-3' },
            },
          ],
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 21,
      })
    );
  });

  it('returns a next cursor from the last visible article when another page exists', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([
      article('article-3', '2026-05-03T00:00:00.000Z'),
      article('article-2', '2026-05-02T00:00:00.000Z'),
      article('article-1', '2026-05-01T00:00:00.000Z'),
    ]);

    const result = await getPublicArticles({ pageSize: 2 });

    expect(result.articles.map((item) => item.id)).toEqual(['article-3', 'article-2']);
    expect(result.hasNext).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(decodeArticleCursor(result.nextCursor!)).toEqual({
      publishedAt: new Date('2026-05-02T00:00:00.000Z'),
      id: 'article-2',
    });
  });

  it('returns an empty page for missing categories', async () => {
    (mockPrisma.category.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getPublicArticles({ category: 'missing', pageSize: 20 });

    expect(result).toEqual({
      articles: [],
      page: null,
      pageSize: 20,
      total: null,
      totalPages: null,
      hasNext: false,
      hasPrev: false,
      nextCursor: null,
    });
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });

  it('keeps legacy offset pagination isolated to explicit page requests', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([article('article-1', '2026-05-01T00:00:00.000Z')]);

    const result = await getPublicArticles({ page: 3, pageSize: 10 });

    expect(result.page).toBe(3);
    expect(result.hasPrev).toBe(true);
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 11,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      })
    );
  });
});
