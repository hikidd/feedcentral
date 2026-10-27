import { NextRequest, NextResponse } from 'next/server';
import { fetchEnabledUserSources } from '@/lib/cron/fetch-user-sources';
import { getCronApiKey } from '@/lib/env';
import { getValidatedConcurrency, getRuntimeConfig } from '@/lib/rss-config';

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

/**
 * Cron endpoint for fetching user-specific RSS feeds.
 * Fetches articles from custom user-added sources (UserSource model).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[USER CRON] Starting user sources fetch...');
    const startTime = Date.now();

    const searchParams = request.nextUrl.searchParams;
    const config = getRuntimeConfig();
    const requestedConcurrency = searchParams.get('concurrency');
    const concurrency = requestedConcurrency
      ? getValidatedConcurrency(parseInt(requestedConcurrency, 10))
      : config.DEFAULT_CONCURRENCY;
    const userId = searchParams.get('userId') || undefined;
    const { sourceCount, results } = await fetchEnabledUserSources({
      concurrency,
      userId,
    });

    const duration = Date.now() - startTime;
    const successful = results.filter(
      (result) => result.status === 'fulfilled' && !result.data?.error
    ).length;
    const failed = results.length - successful;
    const totalAdded = results.reduce((sum, result) => sum + (result.data?.added || 0), 0);
    const totalFound = results.reduce((sum, result) => sum + (result.data?.found || 0), 0);

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${(duration / 1000).toFixed(2)}s`,
      durationMs: duration,
      concurrency,
      type: 'user_sources',
      userId: userId || 'all',
      sources: {
        total: sourceCount,
        successful,
        failed,
      },
      articles: {
        found: totalFound,
        added: totalAdded,
        duplicates: totalFound - totalAdded,
      },
      results: results.map((result) => ({
        source: result.source,
        userId: result.userId,
        status: result.status,
        articlesFound: result.data?.found || 0,
        articlesAdded: result.data?.added || 0,
        error: getErrorMessage(result.error) || result.data?.error,
      })),
    };

    console.log('[USER CRON] User sources fetch completed:', {
      duration: summary.duration,
      sources: summary.sources,
      articles: summary.articles,
    });

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[USER CRON] Error fetching user sources:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Allow manual triggering via POST (for testing/admin).
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
