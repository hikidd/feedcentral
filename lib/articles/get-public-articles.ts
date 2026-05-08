import { prisma } from '@/lib/prisma';
import { decodeArticleCursor, encodeArticleCursor } from './cursor';
import { buildPublicArticleWhere, publicArticleInclude, publicArticleOrderBy, type PublicArticle } from './article-query';

export interface GetPublicArticlesInput {
  category?: string | null;
  sourceId?: string | null;
  cursor?: string | null;
  page?: number | null;
  pageSize?: number | null;
}

export interface PublicArticlesPage {
  articles: PublicArticle[];
  page: number | null;
  pageSize: number;
  total: null;
  totalPages: null;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value == null) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.trunc(value)));
}

export async function getPublicArticles(input: GetPublicArticlesInput = {}): Promise<PublicArticlesPage> {
  const pageSize = normalizePositiveInteger(input.pageSize, 20, 100);
  const page = input.cursor ? null : input.page ?? null;
  const legacyPage = normalizePositiveInteger(page, 1, Number.MAX_SAFE_INTEGER);
  const cursor = input.cursor ? decodeArticleCursor(input.cursor) : undefined;

  let categoryId: string | undefined;

  if (input.category) {
    const categoryRecord = await prisma.category.findUnique({
      where: { slug: input.category },
      select: { id: true },
    });

    if (!categoryRecord) {
      return {
        articles: [],
        page,
        pageSize,
        total: null,
        totalPages: null,
        hasNext: false,
        hasPrev: false,
        nextCursor: null,
      };
    }

    categoryId = categoryRecord.id;
  }

  const articles = await prisma.article.findMany({
    where: buildPublicArticleWhere({
      categoryId,
      sourceId: input.sourceId || undefined,
      cursor,
    }),
    include: publicArticleInclude,
    orderBy: publicArticleOrderBy,
    ...(input.cursor || legacyPage <= 1 ? {} : { skip: (legacyPage - 1) * pageSize }),
    take: pageSize + 1,
  });

  const hasNext = articles.length > pageSize;
  const visibleArticles = hasNext ? articles.slice(0, pageSize) : articles;
  const lastVisibleArticle = visibleArticles[visibleArticles.length - 1];

  return {
    articles: visibleArticles,
    page,
    pageSize,
    total: null,
    totalPages: null,
    hasNext,
    hasPrev: page != null && page > 1,
    nextCursor: hasNext && lastVisibleArticle
      ? encodeArticleCursor({ publishedAt: lastVisibleArticle.publishedAt, id: lastVisibleArticle.id })
      : null,
  };
}
