import { getPublicArticle } from '@/lib/articles/get-public-article';
import { resetAllMocks } from '../../helpers/prisma-mock';

jest.mock('@/lib/prisma', () => {
  const { mockPrisma } = require('../../helpers/prisma-mock');
  return {
    __esModule: true,
    prisma: mockPrisma,
    default: mockPrisma,
  };
});

const { mockPrisma } = require('./../../../tests/helpers/prisma-mock');

const VALID_ARTICLE_ID = 'cm9oczn8w000008l3d4r6f4tt';
const MISSING_ARTICLE_ID = 'cm9oczn8w000018l3d4r6f4tt';

describe('getPublicArticle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks();
  });

  it('fetches a non-deleted public article with source and category data', async () => {
    const mockArticle = {
      id: VALID_ARTICLE_ID,
      title: 'Test Article',
      description: 'Test description',
      content: '<p>Body</p>',
      url: 'https://example.com/article',
      publishedAt: new Date('2026-05-01T00:00:00.000Z'),
      source: { id: 'source-1', name: 'Example', url: 'https://example.com', logoUrl: null },
      category: { id: 'category-1', name: 'Tech', slug: 'tech', color: '#000', icon: 'cpu' },
    };

    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(mockArticle);

    await expect(getPublicArticle(VALID_ARTICLE_ID)).resolves.toBe(mockArticle);
    expect(mockPrisma.article.findFirst).toHaveBeenCalledWith({
      where: {
        id: VALID_ARTICLE_ID,
        deletedAt: null,
      },
      include: {
        source: {
          select: {
            id: true,
            name: true,
            url: true,
            logoUrl: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            icon: true,
          },
        },
      },
    });
  });

  it('returns null when the public article is missing', async () => {
    (mockPrisma.article.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(getPublicArticle(MISSING_ARTICLE_ID)).resolves.toBeNull();
    expect(mockPrisma.article.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MISSING_ARTICLE_ID }),
      })
    );
  });

  it.each(['a'.repeat(129), 'article-123', 'cm9oczn8w000008l3d4r6f4t!'])(
    'rejects invalid article ID %s before querying',
    async (id) => {
      await expect(getPublicArticle(id)).resolves.toBeNull();

      expect(mockPrisma.article.findFirst).not.toHaveBeenCalled();
    }
  );
});
