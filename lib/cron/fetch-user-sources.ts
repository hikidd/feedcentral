import { prisma } from '@/lib/prisma';
import { fetchAndStoreUserArticles } from '@/lib/rss-parser';

export interface UserSourceFetchResult {
  source: string;
  userId: string;
  status: 'fulfilled' | 'rejected';
  data?: { found: number; added: number; error?: string };
  error?: unknown;
}

/**
 * Fetch all enabled user-provided sources in bounded batches.
 *
 * Keeping this in a shared service lets the standalone endpoint and the
 * unified scheduler use the same user-source behavior.
 */
export async function fetchEnabledUserSources(options: {
  concurrency?: number;
  userId?: string;
} = {}): Promise<{
  sourceCount: number;
  results: UserSourceFetchResult[];
}> {
  const concurrency = Math.max(1, options.concurrency ?? 5);
  const userSources = await prisma.userSource.findMany({
    where: {
      isEnabled: true,
      ...(options.userId && { userId: options.userId }),
    },
  });

  console.log(`[USER CRON] Fetching ${userSources.length} user sources with concurrency ${concurrency}`);

  const results: UserSourceFetchResult[] = [];

  for (let i = 0; i < userSources.length; i += concurrency) {
    const batch = userSources.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((source) => fetchAndStoreUserArticles(source))
    );

    results.push(
      ...batchResults.map((result, index) => ({
        source: batch[index].customName || batch[index].feedUrl,
        userId: batch[index].userId,
        status: result.status,
        data: result.status === 'fulfilled' ? result.value : undefined,
        error: result.status === 'rejected' ? result.reason : undefined,
      }))
    );

    console.log(
      `[USER CRON] Completed batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(userSources.length / concurrency)}`
    );
  }

  return {
    sourceCount: userSources.length,
    results,
  };
}
