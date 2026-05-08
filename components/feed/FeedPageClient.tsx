'use client';

import { useEffect, useState } from 'react';
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

function getRequestedPage(): number {
  const page = new URL(window.location.href).searchParams.get('page');
  const parsed = page ? Number(page) : NaN;

  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : 1;
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

  useEffect(() => {
    const requestedPage = getRequestedPage();

    setArticles(initialArticlesPage.articles);
    setPage(1);
    setHasMore(initialArticlesPage.hasNext);
    setNextCursor(initialArticlesPage.nextCursor);
    setTotalPages(initialArticlesPage.totalPages);
    setJumpPage('');

    if (requestedPage > 1) {
      void fetchArticles({ pageNum: requestedPage, append: false });
    }
  }, [category, initialArticlesPage]);

  async function fetchArticles({
    pageNum,
    cursor,
    append,
  }: {
    pageNum: number;
    cursor?: string | null;
    append: boolean;
  }) {
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
        setArticles((current) => (append ? [...current, ...data.data!] : data.data!));
        setHasMore(data.pagination.hasNext ?? false);
        setNextCursor(data.pagination.nextCursor ?? null);
        setTotalPages(data.pagination.totalPages);
        setPage(pageNum);

        const url = new URL(window.location.href);
        url.searchParams.set('page', String(pageNum));
        window.history.replaceState(null, '', url.pathname + url.search);
      }
    } catch (error) {
      console.error('Failed to fetch articles:', error);
    } finally {
      setIsLoading(false);
    }
  }

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
    void fetchArticles({ pageNum: page + 1, cursor: nextCursor, append: false });
  }

  function handlePrevPage() {
    if (page > 1) {
      void fetchArticles({ pageNum: page - 1, append: false });
    }
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

    void fetchArticles({ pageNum: requestedPage, append: false });
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
              <div className="mt-6 flex items-center justify-center gap-3">
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
