import { prisma } from '@/lib/prisma';
import { publicArticleInclude, type PublicArticle } from './article-query';

const PUBLIC_ARTICLE_ID_PATTERN = /^c[a-z0-9]{24}$/;

function isValidPublicArticleId(id: string): boolean {
  return PUBLIC_ARTICLE_ID_PATTERN.test(id);
}

export async function getPublicArticle(id: string): Promise<PublicArticle | null> {
  if (!isValidPublicArticleId(id)) {
    return null;
  }

  return prisma.article.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    include: publicArticleInclude,
  });
}
