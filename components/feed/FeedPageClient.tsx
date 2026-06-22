'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppTabs } from '@/components/layout/AppTabs';
import { FeedList } from '@/components/feed/FeedList';
import { EmptyState } from '@/components/feed/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FeedArticle, FeedArticlesPage, FeedCategory } from '@/lib/feed/get-feed-page-data';

interface FeedPageClientProps {
  mode: 'all' | 'category';
  category?: string | null;
  categories: FeedCategory[];
  activeCategory: FeedCategory | null;
  initialArticlesPage: FeedArticlesPage;
}

interface ArticlesResponse {
  success: boolean;
  data?: FeedArticle[];
  pagination?: Omit<FeedArticlesPage, 'articles'>;
}

interface CachedFeedPage {
  category: string | null;
  page: number;
  pageSize: number;
  savedAt: number;
  articles: FeedArticle[];
  hasMore: boolean;
  nextCursor: string | null;
  totalPages: number | null;
}

const FEED_PAGE_CACHE_TTL = 5 * 60 * 1000;

function getRequestedPage(): number {
  const page = new URL(window.location.href).searchParams.get('page');
  const parsed = page ? Number(page) : NaN;

  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : 1;
}

function getFeedPageCacheKey(category: string | null | undefined, page: number, pageSize: number): string {
  return `feed-page:${window.location.pathname}:${category ?? 'all'}:${pageSize}:${page}`;
}

function readCachedFeedPage(category: string | null | undefined, page: number, pageSize: number): CachedFeedPage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = sessionStorage.getItem(getFeedPageCacheKey(category, page, pageSize));

    if (!rawValue) {
      return null;
    }

    const cached = JSON.parse(rawValue) as Partial<CachedFeedPage>;
    const savedAt = Number(cached.savedAt);

    if (
      cached.category !== (category ?? null) ||
      cached.page !== page ||
      cached.pageSize !== pageSize ||
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > FEED_PAGE_CACHE_TTL ||
      !Array.isArray(cached.articles) ||
      typeof cached.hasMore !== 'boolean'
    ) {
      return null;
    }

    return {
      category: category ?? null,
      page,
      pageSize,
      savedAt,
      articles: cached.articles,
      hasMore: cached.hasMore,
      nextCursor: typeof cached.nextCursor === 'string' ? cached.nextCursor : null,
      totalPages: typeof cached.totalPages === 'number' ? cached.totalPages : null,
    };
  } catch {
    return null;
  }
}

function writeCachedFeedPage(
  category: string | null | undefined,
  page: number,
  pageSize: number,
  data: Pick<CachedFeedPage, 'articles' | 'hasMore' | 'nextCursor' | 'totalPages'>
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(
      getFeedPageCacheKey(category, page, pageSize),
      JSON.stringify({
        category: category ?? null,
        page,
        pageSize,
        savedAt: Date.now(),
        ...data,
      })
    );
  } catch {
    return;
  }
}

export function FeedPageClient({
  mode,
  category,
  categories,
  activeCategory,
  initialArticlesPage,
}: FeedPageClientProps) {
  const t = useTranslations();
  const [articles, setArticles] = useState(initialArticlesPage.articles);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialArticlesPage.hasNext);
  const [nextCursor, setNextCursor] = useState(initialArticlesPage.nextCursor);
  const [totalPages, setTotalPages] = useState<number | null>(initialArticlesPage.totalPages);
  const [jumpPage, setJumpPage] = useState('');

  const articlesRef = useRef(initialArticlesPage.articles);

  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  const fetchArticles = useCallback(async ({
    pageNum,
    cursor,
    append,
    scrollToTop = false,
  }: {
    pageNum: number;
    cursor?: string | null;
    append: boolean;
    scrollToTop?: boolean;
  }) => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ pageSize: String(initialArticlesPage.pageSize) });

      if (category) {
        params.set('category', category);
      }

      if (cursor) {
        params.set('cursor', cursor);
      } else {
        params.set('page', String(pageNum));
      }

      const response = await fetch(`/api/articles?${params.toString()}`);
      const data = (await response.json()) as ArticlesResponse;

      if (data.success && data.data && data.pagination) {
        const nextArticles = append ? [...articlesRef.current, ...data.data] : data.data;
        const nextHasMore = data.pagination.hasNext ?? false;
        const nextCursorValue = data.pagination.nextCursor ?? null;
        const nextTotalPages = data.pagination.totalPages ?? null;

        articlesRef.current = nextArticles;
        setArticles(nextArticles);
        setHasMore(nextHasMore);
        setNextCursor(nextCursorValue);
        setTotalPages(nextTotalPages);
        setPage(pageNum);

        writeCachedFeedPage(category, pageNum, initialArticlesPage.pageSize, {
          articles: nextArticles,
          hasMore: nextHasMore,
          nextCursor: nextCursorValue,
          totalPages: nextTotalPages,
        });

        const url = new URL(window.location.href);
        if (pageNum > 1) {
          url.searchParams.set('page', String(pageNum));
        } else {
          url.searchParams.delete('page');
        }
        window.history.replaceState(null, '', url.pathname + url.search);

        if (scrollToTop) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } catch (error) {
      console.error('Failed to fetch articles:', error);
    } finally {
      setIsLoading(false);
    }
  }, [category, initialArticlesPage.pageSize]);

  useEffect(() => {
    const requestedPage = getRequestedPage();
    const cachedPage = readCachedFeedPage(category, requestedPage, initialArticlesPage.pageSize);

    if (cachedPage) {
      articlesRef.current = cachedPage.articles;
      setArticles(cachedPage.articles);
      setPage(cachedPage.page);
      setHasMore(cachedPage.hasMore);
      setNextCursor(cachedPage.nextCursor);
      setTotalPages(cachedPage.totalPages);
      setJumpPage('');
      return;
    }

    articlesRef.current = initialArticlesPage.articles;
    setArticles(initialArticlesPage.articles);
    setPage(1);
    setHasMore(initialArticlesPage.hasNext);
    setNextCursor(initialArticlesPage.nextCursor);
    setTotalPages(initialArticlesPage.totalPages);
    setJumpPage('');

    writeCachedFeedPage(category, 1, initialArticlesPage.pageSize, {
      articles: initialArticlesPage.articles,
      hasMore: initialArticlesPage.hasNext,
      nextCursor: initialArticlesPage.nextCursor,
      totalPages: initialArticlesPage.totalPages,
    });

    if (requestedPage > 1) {
      void fetchArticles({ pageNum: requestedPage, append: false });
    }
  }, [category, fetchArticles, initialArticlesPage]);

  async function handleRefresh() {
    setIsRefreshing(true);

    try {
      await fetch('/api/cron/fetch-feeds', { method: 'POST' });
      window.setTimeout(() => {
        void fetchArticles({ pageNum: 1, append: false }).finally(() => setIsRefreshing(false));
      }, 2000);
    } catch (error) {
      console.error('Failed to refresh feeds:', error);
      setIsRefreshing(false);
    }
  }

  function handleNextPage() {
    void fetchArticles({ pageNum: page + 1, cursor: nextCursor, append: false, scrollToTop: true });
  }

  function handlePrevPage() {
    if (page > 1) {
      void fetchArticles({ pageNum: page - 1, append: false, scrollToTop: true });
    }
  }

  function handleFirstPage() {
    if (page === 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    void fetchArticles({ pageNum: 1, append: false, scrollToTop: true });
  }

  function handleLoadMore() {
    void fetchArticles({ pageNum: page + 1, cursor: nextCursor, append: true });
  }

  function handleJumpToPage() {
    const requestedPage = Number(jumpPage);

    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
      return;
    }

    if (totalPages && requestedPage > totalPages) {
      return;
    }

    void fetchArticles({ pageNum: requestedPage, append: false, scrollToTop: true });
    setJumpPage('');
  }

  const tabs = [
    { id: 'all', name: t('category.all'), slug: 'all', order: 0 },
    ...categories,
  ].map((item) => ({
    label: item.slug === 'all' ? item.name : t(`category.${item.slug}`),
    href: item.slug === 'all' ? '/app' : `/app/${item.slug}`,
    value: item.slug,
  }));
  const categoryName = activeCategory ? t(`category.${activeCategory.slug}`) : category;

  return (
    <div style={{ width: '100%' }}>
      <AppTabs tabs={tabs} />

      <div className="content-container px-4 py-6 sm:px-6">
        {mode === 'category' && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {categoryName || category}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('category.latestArticles', { category: (categoryName || category || '').toLowerCase() })}
            </p>
          </div>
        )}

        {articles.length > 0 ? (
          <>
            <FeedList articles={articles} />

            {mode === 'all' ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" size="sm" onClick={handleFirstPage} disabled={isLoading}>
                  {t('common.firstPage')}
                </Button>

                <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={isLoading || page === 1}>
                  {t('common.prev') || 'Prev'}
                </Button>

                <div className="text-sm text-muted-foreground">
                  {`${t('common.page') || 'Page'} ${page}${totalPages ? ` / ${totalPages}` : ''}`}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={jumpPage}
                    onChange={(event) => setJumpPage(event.target.value)}
                    placeholder={t('common.page') || 'Page'}
                    className="w-20"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleJumpToPage();
                    }}
                    aria-label={t('common.page') || 'Page'}
                  />

                  <Button variant="default" size="sm" onClick={handleJumpToPage} disabled={isLoading || jumpPage.trim() === ''}>
                    Go
                  </Button>
                </div>

                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={isLoading || !hasMore}>
                  {isLoading ? t('common.loading') : t('common.next') || 'Next'}
                </Button>
              </div>
            ) : (
              hasMore && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={jumpPage}
                      onChange={(event) => setJumpPage(event.target.value)}
                      placeholder={t('common.page') || 'Page'}
                      className={cn('w-20')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleJumpToPage();
                      }}
                      aria-label={t('common.page') || 'Page'}
                    />

                    <Button onClick={handleJumpToPage} disabled={isLoading || jumpPage.trim() === ''} size="sm">
                      Go
                    </Button>
                  </div>

                  <div className="flex justify-center">
                    <Button onClick={handleLoadMore} disabled={isLoading} variant="outline">
                      {isLoading ? t('common.loading') : t('appPage.loadMore')}
                    </Button>
                  </div>
                </div>
              )
            )}
          </>
        ) : (
          <EmptyState
            title={mode === 'all' ? t('feed.empty.title') : t('category.empty.title')}
            description={
              mode === 'all'
                ? t('feed.empty.description')
                : t('category.empty.description', { category: categoryName || category || '' })
            }
            action={
              mode === 'all'
                ? {
                    label: t('appPage.refreshFeeds'),
                    onClick: handleRefresh,
                    loading: isRefreshing,
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
