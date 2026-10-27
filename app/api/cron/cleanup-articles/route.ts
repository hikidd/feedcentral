import { NextRequest, NextResponse } from 'next/server';
import { cleanupArticles } from '@/lib/cron/cleanup-articles';
import { getCronApiKey } from '@/lib/env';

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronApiKey = getCronApiKey();
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isVercelCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAuthorizedWithApiKey = !!cronApiKey && authHeader === `Bearer ${cronApiKey}`;

  return isDevelopment || isVercelCron || isAuthorizedWithApiKey;
}

/**
 * Cron endpoint for article cleanup.
 *
 * The cleanup implementation is shared with the unified cron endpoint so the
 * same retention policy is used regardless of how cleanup is triggered.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[CLEANUP] Starting article cleanup...');
    const summary = await cleanupArticles();
    console.log('[CLEANUP] Article cleanup completed:', summary);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CLEANUP] Error cleaning up articles:', error);
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
