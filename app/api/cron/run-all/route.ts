import { NextRequest, NextResponse } from 'next/server';
import { cleanupArticles, type CleanupArticlesSummary } from '@/lib/cron/cleanup-articles';
import { fetchEnabledUserSources, type UserSourceFetchResult } from '@/lib/cron/fetch-user-sources';
import { getCronApiKey } from '@/lib/env';
import { fetchAllActiveSources } from '@/lib/rss-parser';
import { getValidatedConcurrency, getRuntimeConfig } from '@/lib/rss-config';

type FeedFetchResult = Awaited<ReturnType<typeof fetchAllActiveSources>>[number];
type FetchResult = FeedFetchResult | UserSourceFetchResult;

type FetchSummary = {
  total: number;
  successful: number;
  failed: number;
  articlesFound: number;
  articlesAdded: number;
  results: Array<{
    source: string;
    userId?: string;
    status: 'fulfilled' | 'rejected';
    articlesFound: number;
    articlesAdded: number;
    error?: string;
  }>;
};

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronApiKey = getCronApiKey();
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isVercelCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAuthorizedWithApiKey = !!cronApiKey && authHeader === `Bearer ${cronApiKey}`;

  return isDevelopment || isVercelCron || isAuthorizedWithApiKey;
}

function getErrorMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }

  return error instanceof Error ? error.message : String(error);
}

function summarizeResults(results: FetchResult[]): FetchSummary {
  const successful = results.filter(
    (result) => result.status === 'fulfilled' && !result.data?.error
  ).length;
  const failed = results.length - successful;

  return {
    total: results.length,
    successful,
    failed,
    articlesFound: results.reduce((sum, result) => sum + (result.data?.found || 0), 0),
    articlesAdded: results.reduce((sum, result) => sum + (result.data?.added || 0), 0),
    results: results.map((result) => ({
      source: result.source,
      ...('userId' in result ? { userId: result.userId } : {}),
      status: result.status,
      articlesFound: result.data?.found || 0,
      articlesAdded: result.data?.added || 0,
      error: getErrorMessage(result.error) || result.data?.error,
    })),
  };
}

function isWeeklyCleanupWindow(now: Date): boolean {
  // The Worker runs at minute 0. Monday 00:00 UTC is Monday 08:00 in Beijing.
  return now.getUTCDay() === 1 && now.getUTCHours() === 0;
}

async function runAll(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const config = getRuntimeConfig();
  const requestedConcurrency = searchParams.get('concurrency');
  const concurrency = requestedConcurrency
    ? getValidatedConcurrency(parseInt(requestedConcurrency, 10))
    : config.DEFAULT_CONCURRENCY;
  const forceCleanup = searchParams.get('forceCleanup') === 'true';
  const now = new Date();
  const cleanupDue = isWeeklyCleanupWindow(now);
  const shouldRunCleanup = cleanupDue || forceCleanup;
  const stageErrors: string[] = [];

  let global: FetchSummary = summarizeResults([]);
  try {
    console.log('[CRON] Starting global source fetch...');
    const results = await fetchAllActiveSources({ concurrency });
    global = summarizeResults(results);
  } catch (error) {
    const message = getErrorMessage(error) || 'Global source fetch failed';
    stageErrors.push(`global: ${message}`);
    console.error('[CRON] Global source fetch failed:', error);
  }

  let user: FetchSummary = summarizeResults([]);
  try {
    console.log('[CRON] Starting user source fetch...');
    const { results } = await fetchEnabledUserSources({ concurrency });
    user = summarizeResults(results);
  } catch (error) {
    const message = getErrorMessage(error) || 'User source fetch failed';
    stageErrors.push(`user: ${message}`);
    console.error('[CRON] User source fetch failed:', error);
  }

  let cleanup: {
    ran: boolean;
    due: boolean;
    forced: boolean;
    summary?: CleanupArticlesSummary;
    error?: string;
  } = {
    ran: false,
    due: cleanupDue,
    forced: forceCleanup,
  };

  if (shouldRunCleanup) {
    try {
      console.log('[CRON] Starting weekly article cleanup...');
      const summary = await cleanupArticles(now);
      cleanup = {
        ran: true,
        due: cleanupDue,
        forced: forceCleanup,
        summary,
      };
      console.log('[CRON] Weekly article cleanup completed:', summary);
    } catch (error) {
      const message = getErrorMessage(error) || 'Article cleanup failed';
      stageErrors.push(`cleanup: ${message}`);
      cleanup = {
        ran: true,
        due: cleanupDue,
        forced: forceCleanup,
        error: message,
      };
      console.error('[CRON] Weekly article cleanup failed:', error);
    }
  }

  const response = {
    success: stageErrors.length === 0,
    timestamp: now.toISOString(),
    durationMs: Date.now() - startTime,
    concurrency,
    global,
    user,
    cleanup,
    errors: stageErrors,
  };

  return NextResponse.json(response, {
    status: stageErrors.length === 0 ? 200 : 500,
  });
}

/**
 * Unified scheduler endpoint for global feeds, user feeds, and weekly cleanup.
 */
export async function GET(request: NextRequest) {
  return runAll(request);
}

export async function POST(request: NextRequest) {
  return runAll(request);
}
