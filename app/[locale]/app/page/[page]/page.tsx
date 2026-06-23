import { notFound } from 'next/navigation';
import { FeedPageClient } from '@/components/feed/FeedPageClient';
import { getFeedPageData, getFeedPageStaticParams, normalizeStaticFeedPageParam } from '@/lib/feed/get-feed-page-data';

export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = false;

export function generateStaticParams() {
  return getFeedPageStaticParams();
}

export default async function AppPaginatedPage({ params }: { params: Promise<{ page: string }> }) {
  const { page: pageParam } = await params;
  const page = normalizeStaticFeedPageParam(pageParam);

  if (!page) {
    notFound();
  }

  const data = await getFeedPageData({ page });

  return (
    <FeedPageClient
      mode="all"
      categories={data.categories}
      activeCategory={data.activeCategory}
      initialArticlesPage={data.articlesPage}
    />
  );
}
