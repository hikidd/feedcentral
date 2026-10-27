import { prisma } from '@/lib/prisma';

const USER_ARTICLE_HARD_DELETE_BATCH_SIZE = 1000;

export interface CleanupArticlesSummary {
  success: true;
  timestamp: string;
  duration: string;
  cleanup: {
    softDeleted: number;
    archived: number;
    hardDeleted: number;
    userSoftDeleted: number;
    userArchivedMarked: number;
    userBookmarksDeleted: number;
    userHardDeleted: number;
    total: number;
  };
  cutoffDates: {
    softDelete: string;
    hardDelete: string;
  };
}

/**
 * Remove expired RSS content while preserving bookmarked article context.
 *
 * Public and user-provided articles share the same 7/14-day retention window.
 * This function is shared by the standalone cleanup route and the unified cron
 * runner so the cleanup policy is applied consistently.
 */
export async function cleanupArticles(now = new Date()): Promise<CleanupArticlesSummary> {
  const startTime = Date.now();

  // Calculate cutoff dates.
  const softDeleteCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const hardDeleteCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Step 1: Find articles to soft-delete (7+ days old, not already deleted, not bookmarked).
  const articlesToSoftDelete = await prisma.article.findMany({
    where: {
      publishedAt: {
        lt: softDeleteCutoff,
        gte: hardDeleteCutoff,
      },
      deletedAt: null,
      bookmarks: {
        none: {},
      },
    },
    select: {
      id: true,
    },
  });

  let softDeleted = 0;
  if (articlesToSoftDelete.length > 0) {
    const result = await prisma.article.updateMany({
      where: {
        id: {
          in: articlesToSoftDelete.map((article) => article.id),
        },
      },
      data: {
        deletedAt: now,
      },
    });
    softDeleted = result.count;
  }

  // Step 2: Archive bookmarked articles during the 7-to-14-day retention window.
  const bookmarkedOldArticles = await prisma.article.findMany({
    where: {
      publishedAt: {
        lt: softDeleteCutoff,
        gte: hardDeleteCutoff,
      },
      deletedAt: null,
      bookmarks: {
        some: {},
      },
    },
    include: {
      source: {
        select: {
          name: true,
          url: true,
        },
      },
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  let archived = 0;
  for (const article of bookmarkedOldArticles) {
    await prisma.article.update({
      where: { id: article.id },
      data: {
        deletedAt: now,
        archivedData: {
          title: article.title,
          description: article.description,
          url: article.url,
          imageUrl: article.imageUrl,
          author: article.author,
          publishedAt: article.publishedAt,
          source: article.source,
          category: article.category,
          preservedForBookmarks: true,
        },
      },
    });
    archived++;
  }

  // Step 3: Hard-delete very old public articles.
  const hardDeleteResult = await prisma.article.deleteMany({
    where: {
      publishedAt: {
        lt: hardDeleteCutoff,
      },
    },
  });
  const hardDeleted = hardDeleteResult.count;

  // Apply the same retention policy to user-provided articles.
  const userArticlesToSoftDelete = await prisma.userArticle.findMany({
    where: {
      publishedAt: {
        lt: softDeleteCutoff,
        gte: hardDeleteCutoff,
      },
      deletedAt: null,
      bookmarks: {
        none: {},
      },
    },
    select: { id: true },
  });

  let userSoftDeleted = 0;
  if (userArticlesToSoftDelete.length > 0) {
    const result = await prisma.userArticle.updateMany({
      where: { id: { in: userArticlesToSoftDelete.map((article) => article.id) } },
      data: { deletedAt: now },
    });
    userSoftDeleted = result.count;
  }

  const bookmarkedOldUserArticles = await prisma.userArticle.findMany({
    where: {
      publishedAt: { lt: softDeleteCutoff, gte: hardDeleteCutoff },
      deletedAt: null,
      bookmarks: { some: {} },
    },
    select: { id: true },
  });

  let userArchivedMarked = 0;
  for (const userArticle of bookmarkedOldUserArticles) {
    await prisma.userArticle.update({
      where: { id: userArticle.id },
      data: { deletedAt: now },
    });
    userArchivedMarked++;
  }

  let userBookmarksDeleted = 0;
  let userHardDeleted = 0;

  while (true) {
    const userArticlesToHardDelete = await prisma.userArticle.findMany({
      where: {
        publishedAt: { lt: hardDeleteCutoff },
      },
      select: { id: true },
      take: USER_ARTICLE_HARD_DELETE_BATCH_SIZE,
    });
    const userArticleIdsToHardDelete = userArticlesToHardDelete.map((article) => article.id);

    if (userArticleIdsToHardDelete.length === 0) {
      break;
    }

    const [userBookmarkDeleteResult, userHardDeleteResult] = await prisma.$transaction([
      prisma.bookmark.deleteMany({
        where: {
          userArticleId: { in: userArticleIdsToHardDelete },
        },
      }),
      prisma.userArticle.deleteMany({
        where: {
          id: { in: userArticleIdsToHardDelete },
        },
      }),
    ]);

    userBookmarksDeleted += userBookmarkDeleteResult.count;
    userHardDeleted += userHardDeleteResult.count;
  }

  return {
    success: true,
    timestamp: now.toISOString(),
    duration: `${Date.now() - startTime}ms`,
    cleanup: {
      softDeleted,
      archived,
      hardDeleted,
      userSoftDeleted,
      userArchivedMarked,
      userBookmarksDeleted,
      userHardDeleted,
      total:
        softDeleted +
        archived +
        hardDeleted +
        userSoftDeleted +
        userArchivedMarked +
        userBookmarksDeleted +
        userHardDeleted,
    },
    cutoffDates: {
      softDelete: softDeleteCutoff.toISOString(),
      hardDelete: hardDeleteCutoff.toISOString(),
    },
  };
}
