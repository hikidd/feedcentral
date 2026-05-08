import { FeedPageClient } from '@/components/feed/FeedPageClient';
import { getFeedPageData } from '@/lib/feed/get-feed-page-data';

export const dynamic = 'force-static';
export const revalidate = 120;

export default async function AppDashboard() {
  const data = await getFeedPageData();

  return (
    <FeedPageClient
      mode="all"
      categories={data.categories}
      activeCategory={data.activeCategory}
      initialArticlesPage={data.articlesPage}
    />
  );
}
