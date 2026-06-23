import { notFound } from 'next/navigation';
import { FeedPageClient } from '@/components/feed/FeedPageClient';
import {
  getFeedCategoryPageStaticParams,
  getFeedPageData,
  isValidFeedCategorySlug,
  normalizeStaticFeedPageParam,
} from '@/lib/feed/get-feed-page-data';

export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = false;

export function generateStaticParams() {
  return getFeedCategoryPageStaticParams();
}

export default async function CategoryPaginatedPage({ params }: { params: Promise<{ category: string; page: string }> }) {
  const { category, page: pageParam } = await params;
  const page = normalizeStaticFeedPageParam(pageParam);

  if (!page || !isValidFeedCategorySlug(category)) {
    notFound();
  }

  const data = await getFeedPageData({ category, page });

  if (!data.activeCategory) {
    notFound();
  }

  return (
    <FeedPageClient
      mode="category"
      category={category}
      categories={data.categories}
      activeCategory={data.activeCategory}
      initialArticlesPage={data.articlesPage}
    />
  );
}
