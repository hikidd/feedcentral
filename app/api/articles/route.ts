import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cache } from '@/lib/cache';

/**
 * GET /api/articles
 * Fetch public articles with pagination and filtering
 * Query params: category, page, pageSize, sourceId
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const sourceId = searchParams.get('sourceId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));

    let articles: any[] = [];

    // Build cache key for anonymous queries (do not cache per-user private results)
    const cacheTtlSec = Number(process.env.API_CACHE_TTL_SEC || '60');
    const cacheKey = `articles:page=${page}:size=${pageSize}:cat=${category||''}:src=${sourceId||''}`;
    // Cache bypass: allow clients (admins/tools) to bypass the server cache by
    // setting header `x-bypass-cache: 1` or query `?bypassCache=1`. This is
    // controlled by API_ALLOW_CACHE_BYPASS env var (default: enabled outside prod).
    const searchParams2 = request.nextUrl.searchParams;
    const bypassParam = searchParams2.get('bypassCache');
    const bypassHeader = request.headers.get('x-bypass-cache');
    const bypassRequested = bypassParam === '1' || bypassParam === 'true' || bypassHeader === '1' || bypassHeader === 'true';
    const allowCacheBypass = process.env.API_ALLOW_CACHE_BYPASS ? (process.env.API_ALLOW_CACHE_BYPASS === '1' || process.env.API_ALLOW_CACHE_BYPASS === 'true') : (process.env.NODE_ENV !== 'production');
    const skipCache = bypassRequested && allowCacheBypass;

    // Avoid using the server-side cache during tests so test cases that mock DB
    // failures can assert error paths reliably. In production/dev, use the cache
    // unless skipCache is requested and allowed.
    const useCache = process.env.NODE_ENV !== 'test' && !skipCache;
    if (useCache) {
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        const resp = NextResponse.json(cached);
        resp.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return resp;
      }
    }

    const where: any = {
      deletedAt: null,
    };

    if (category) {
      const categoryRecord = await prisma.category.findUnique({
        where: { slug: category },
        select: { id: true },
      });

      if (!categoryRecord) {
        const responseBody = {
          success: true,
          data: [],
          pagination: {
            page,
            pageSize,
            total: null,
            totalPages: null,
            hasNext: false,
            hasPrev: false,
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
      }

      where.categoryId = categoryRecord.id;
    }

    if (sourceId) {
      where.sourceId = sourceId;
    }

    articles = await prisma.article.findMany({
      where,
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
      orderBy: {
        publishedAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    });

    const hasNext = articles.length > pageSize;
    const visibleArticles = hasNext ? articles.slice(0, pageSize) : articles;

    const responseBody = {
      success: true,
      data: visibleArticles,
      pagination: {
        page,
        pageSize,
        total: null,
        totalPages: null,
        hasNext,
        hasPrev: page > 1,
      },
    };

    // Cache public responses server-side to reduce DB load unless bypassed
    if (!skipCache) {
      try {
        cache.set(cacheKey, responseBody, cacheTtlSec * 1000);
      } catch (e) {
        // non-fatal
        console.warn('articles: cache set failed', e);
      }
    }

    const response = NextResponse.json(responseBody);
    // Cache for 60 seconds, stale-while-revalidate for better performance
    response.headers.set('Cache-Control', `public, s-maxage=${cacheTtlSec}, stale-while-revalidate=300`);

    return response;
  } catch (error: any) {
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
