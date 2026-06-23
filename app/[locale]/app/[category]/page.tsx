import { notFound } from 'next/navigation';
import { FeedPageClient } from '@/components/feed/FeedPageClient';
import { getFeedCategoryStaticParams, getFeedPageData, isValidFeedCategorySlug } from '@/lib/feed/get-feed-page-data';

export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = false;

export function generateStaticParams() {
  return getFeedCategoryStaticParams();
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;

  if (!isValidFeedCategorySlug(category)) {
    notFound();
  }

  const data = await getFeedPageData({ category });

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
