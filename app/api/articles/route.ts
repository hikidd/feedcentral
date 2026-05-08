import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/cache';
import { getPublicArticles } from '@/lib/articles/get-public-articles';
import { InvalidArticleCursorError, MAX_ARTICLE_CURSOR_LENGTH } from '@/lib/articles/cursor';

const MAX_PAGE_SIZE = 100;
const MAX_LEGACY_PAGE = 1000;
const MAX_CATEGORY_LENGTH = 100;
const MAX_SOURCE_ID_LENGTH = 128;
const CATEGORY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

class InvalidArticleQueryParametersError extends Error {
  constructor() {
    super('Invalid article query parameters');
    this.name = 'InvalidArticleQueryParametersError';
  }
}

function parseBoundedInteger(value: string | null, fallback: number, max: number): number {
  if (value == null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw new InvalidArticleQueryParametersError();
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new InvalidArticleQueryParametersError();
  }

  return parsed;
}

function parseCacheTtlSeconds(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    return 60;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 3600) {
    return 60;
  }

  return parsed;
}

function validateOptionalValue(value: string | null, maxLength: number, pattern?: RegExp): string | null {
  if (value == null) {
    return null;
  }

  if (value.length === 0 || value.length > maxLength || (pattern && !pattern.test(value))) {
    throw new InvalidArticleQueryParametersError();
  }

  return value;
}

function buildArticlesCacheKey(input: {
  category: string | null;
  sourceId: string | null;
  cursor: string | null;
  page: number | null;
  pageSize: number;
}) {
  return `articles:${Buffer.from(JSON.stringify(input)).toString('base64url')}`;
}

/**
 * GET /api/articles
 * Fetch public articles with pagination and filtering
 * Query params: category, page, pageSize, sourceId, cursor
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = validateOptionalValue(searchParams.get('category'), MAX_CATEGORY_LENGTH, CATEGORY_PATTERN);
    const sourceId = validateOptionalValue(searchParams.get('sourceId'), MAX_SOURCE_ID_LENGTH, SOURCE_ID_PATTERN);
    const cursor = validateOptionalValue(searchParams.get('cursor'), MAX_ARTICLE_CURSOR_LENGTH);
    const page = cursor ? null : parseBoundedInteger(searchParams.get('page'), 1, MAX_LEGACY_PAGE);
    const pageSize = parseBoundedInteger(searchParams.get('pageSize'), 20, MAX_PAGE_SIZE);

    const cacheTtlSec = parseCacheTtlSeconds(process.env.API_CACHE_TTL_SEC);
    const cacheKey = buildArticlesCacheKey({ category, sourceId, cursor, page, pageSize });
    const bypassParam = searchParams.get('bypassCache');
    const bypassHeader = request.headers.get('x-bypass-cache');
    const bypassRequested = bypassParam === '1' || bypassParam === 'true' || bypassHeader === '1' || bypassHeader === 'true';
    const allowCacheBypass = process.env.API_ALLOW_CACHE_BYPASS
      ? process.env.API_ALLOW_CACHE_BYPASS === '1' || process.env.API_ALLOW_CACHE_BYPASS === 'true'
      : process.env.NODE_ENV !== 'production';
    const skipCache = bypassRequested && allowCacheBypass;

    const useCache = process.env.NODE_ENV !== 'test' && !skipCache;
    if (useCache) {
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        const response = NextResponse.json(cached);
        response.headers.set('Cache-Control', `public, s-maxage=${cacheTtlSec}, stale-while-revalidate=300`);
        return response;
      }
    }

    const articlesPage = await getPublicArticles({
      category,
      sourceId,
      cursor,
      page,
      pageSize,
    });

    const responseBody = {
      success: true,
      data: articlesPage.articles,
      pagination: {
        page: articlesPage.page,
        pageSize: articlesPage.pageSize,
        total: articlesPage.total,
        totalPages: articlesPage.totalPages,
        hasNext: articlesPage.hasNext,
        hasPrev: articlesPage.hasPrev,
        nextCursor: articlesPage.nextCursor,
      },
    };

    if (!skipCache) {
      try {
        cache.set(cacheKey, responseBody, cacheTtlSec * 1000);
      } catch (e) {
        console.warn('articles: cache set failed', e);
      }
    }

    const response = NextResponse.json(responseBody);
    response.headers.set('Cache-Control', `public, s-maxage=${cacheTtlSec}, stale-while-revalidate=300`);

    return response;
  } catch (error: any) {
    if (error instanceof InvalidArticleQueryParametersError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid article query parameters',
        },
        { status: 400 }
      );
    }

    if (error instanceof InvalidArticleCursorError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid article cursor',
        },
        { status: 400 }
      );
    }

    console.error('Error fetching articles:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch articles',
      },
      { status: 500 }
    );
  }
}
