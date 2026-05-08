import type { Prisma } from '@prisma/client';
import type { ArticleCursor } from './cursor';

export const publicArticleInclude = {
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
} satisfies Prisma.ArticleInclude;

export type PublicArticle = Prisma.ArticleGetPayload<{ include: typeof publicArticleInclude }>;

export const publicArticleOrderBy = [
  { publishedAt: 'desc' as const },
  { id: 'desc' as const },
] satisfies Prisma.ArticleOrderByWithRelationInput[];

interface PublicArticleWhereInput {
  categoryId?: string;
  sourceId?: string;
  cursor?: ArticleCursor;
}

export function buildPublicArticleWhere(input: PublicArticleWhereInput = {}): Prisma.ArticleWhereInput {
  const baseWhere: Prisma.ArticleWhereInput = {
    deletedAt: null,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
  };

  if (!input.cursor) {
    return baseWhere;
  }

  return {
    ...baseWhere,
    OR: [
      { publishedAt: { lt: input.cursor.publishedAt } },
      {
        publishedAt: input.cursor.publishedAt,
        id: { lt: input.cursor.id },
      },
    ],
  };
}
