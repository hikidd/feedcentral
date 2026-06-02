import { revalidatePath } from 'next/cache';
import { defaultLocale, locales } from '@/i18n-config';
import { getSiteUrl } from '@/lib/env';
import { isValidFeedCategorySlug } from '@/lib/feed/category-slug';
import { ensureUrlAllowed } from '@/lib/rss-fetch';

const MAX_PREWARM_ARTICLES = 20;
const PREWARM_TIMEOUT_MS = 5000;

export interface FeedCacheWarmupArticle {
  id: string;
  category: {
    slug: string;
  } | null;
}

export async function refreshFeedCacheForArticles(articles: FeedCacheWarmupArticle[]): Promise<void> {
  if (articles.length === 0) {
    return;
  }

  revalidateFeedPaths(articles);
  await prewarmArticlePages(articles.slice(0, MAX_PREWARM_ARTICLES));
}

function revalidateFeedPaths(articles: FeedCacheWarmupArticle[]) {
  const categorySlugs = Array.from(
    new Set(articles.map((article) => article.category?.slug).filter(isValidFeedCategorySlug))
  );

  for (const locale of locales) {
    revalidatePath(`/${locale}/app`);

    for (const slug of categorySlugs) {
      revalidatePath(`/${locale}/app/${encodeURIComponent(slug)}`);
    }
  }
}

async function prewarmArticlePages(articles: FeedCacheWarmupArticle[]) {
  let baseUrl: string;

  try {
    baseUrl = await getPrewarmOrigin();
  } catch (error) {
    console.warn('[RSS] Failed to prepare article page prewarm:', error);
    return;
  }

  const urls = articles.map(
    (article) => `${baseUrl}/${defaultLocale}/article/${encodeURIComponent(article.id)}`
  );

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(PREWARM_TIMEOUT_MS),
        headers: {
          'x-feedcentral-cache-prewarm': '1',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        throw new Error(`Prewarm redirect rejected for ${url}: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`Prewarm failed for ${url}: ${response.status}`);
      }
    })
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[RSS] Failed to prewarm article page cache:', result.reason);
    }
  }
}

async function getPrewarmOrigin(): Promise<string> {
  const siteUrl = new URL(getSiteUrl());

  if (siteUrl.protocol !== 'http:' && siteUrl.protocol !== 'https:') {
    throw new Error('Site URL must use HTTP or HTTPS');
  }

  if (process.env.NODE_ENV === 'production') {
    if (siteUrl.protocol !== 'https:') {
      throw new Error('Production site URL must use HTTPS');
    }

    await ensureUrlAllowed(siteUrl.origin);
  }

  return siteUrl.origin;
}
