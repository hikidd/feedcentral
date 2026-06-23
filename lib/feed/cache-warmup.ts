import { revalidatePath } from 'next/cache';
import { getSiteUrl } from '@/lib/env';
import { isValidFeedCategorySlug } from '@/lib/feed/category-slug';
import { ensureUrlAllowed } from '@/lib/rss-fetch';

const MAX_PREWARM_ARTICLES = 20;
const PREWARM_TIMEOUT_MS = 5000;
const FEED_CACHE_LOCALE = 'cn';
const FEED_ROOT_PATH = `/${FEED_CACHE_LOCALE}/app`;

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

  const feedPaths = getFeedPaths(articles);

  for (const path of feedPaths) {
    revalidatePath(path);
  }

  await prewarmPaths([
    ...feedPaths,
    ...getArticlePaths(articles.slice(0, MAX_PREWARM_ARTICLES)),
  ]);
}

function getFeedPaths(articles: FeedCacheWarmupArticle[]) {
  const categorySlugs = Array.from(
    new Set(articles.map((article) => article.category?.slug).filter(isValidFeedCategorySlug))
  );

  return [
    FEED_ROOT_PATH,
    ...categorySlugs.map((slug) => `${FEED_ROOT_PATH}/${encodeURIComponent(slug)}`),
  ];
}

function getArticlePaths(articles: FeedCacheWarmupArticle[]) {
  return articles.map((article) => `/${FEED_CACHE_LOCALE}/article/${encodeURIComponent(article.id)}`);
}

async function prewarmPaths(paths: string[]) {
  let baseUrl: string;

  try {
    baseUrl = await getPrewarmOrigin();
  } catch (error) {
    console.warn('[RSS] Failed to prepare cache prewarm:', error);
    return;
  }

  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const url = `${baseUrl}${path}`;
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
      console.warn('[RSS] Failed to prewarm cache path:', result.reason);
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
