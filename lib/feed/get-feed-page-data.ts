import { hostname } from 'os';
import { prisma } from '@/lib/prisma';
import { getPublicArticles, type PublicArticlesPage } from '@/lib/articles/get-public-articles';
import type { PublicArticle } from '@/lib/articles/article-query';

const CATEGORY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CATEGORY_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20;

export interface FeedCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  order: number;
}

export interface FeedArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string;
  source: {
    id: string;
    name: string;
    url: string;
    logoUrl: string | null;
  };
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
  };
}

export interface FeedArticlesPage extends Omit<PublicArticlesPage, 'articles'> {
  articles: FeedArticle[];
}

export interface FeedPageData {
  categories: FeedCategory[];
  activeCategory: FeedCategory | null;
  articlesPage: FeedArticlesPage;
}

export interface FeedCategoryStaticParam {
  category: string;
}

interface GetFeedPageDataInput {
  category?: string | null;
}

function serializeFeedArticle(article: PublicArticle): FeedArticle {
  return {
    id: article.id,
    title: article.title,
    description: article.description,
    url: article.url,
    imageUrl: article.imageUrl,
    author: article.author,
    publishedAt: article.publishedAt.toISOString(),
    source: article.source,
    category: article.category,
  };
}

function serializeArticlesPage(articlesPage: PublicArticlesPage): FeedArticlesPage {
  return {
    ...articlesPage,
    articles: articlesPage.articles.map(serializeFeedArticle),
  };
}

function emptyArticlesPage(): FeedArticlesPage {
  return {
    articles: [],
    page: null,
    pageSize: DEFAULT_PAGE_SIZE,
    total: null,
    totalPages: null,
    hasNext: false,
    hasPrev: false,
    nextCursor: null,
  };
}

export function isValidFeedCategorySlug(category: string | null | undefined): category is string {
  return typeof category === 'string' && category.length <= MAX_CATEGORY_LENGTH && CATEGORY_PATTERN.test(category);
}

function normalizeCategory(category: string | null | undefined): string | null {
  if (!category) {
    return null;
  }

  return isValidFeedCategorySlug(category) ? category : null;
}

function shouldReturnEmptyPageWithoutDatabase(): boolean {
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || process.env.npm_lifecycle_event === 'build';
  const localBuildHostname = process.env.FEED_EMPTY_BUILD_LOCAL_HOSTNAME;

  return (
    isBuildPhase
    && process.env.FEED_ALLOW_EMPTY_BUILD_WITHOUT_DATABASE === 'local-only'
    && !!localBuildHostname
    && localBuildHostname === hostname()
    && !process.env.CI
    && !process.env.VERCEL
  );
}

function canReadFeedDatabase(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.DATABASE_URL) {
    return true;
  }

  if (shouldReturnEmptyPageWithoutDatabase()) {
    return false;
  }

  throw new Error('DATABASE_URL must be configured to render feed pages');
}

async function getFeedCategories(): Promise<FeedCategory[]> {
  return prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      color: true,
      order: true,
    },
    orderBy: { order: 'asc' },
  });
}

export async function getFeedCategoryStaticParams(): Promise<FeedCategoryStaticParam[]> {
  if (!canReadFeedDatabase()) {
    return [];
  }

  const categories = await prisma.category.findMany({
    select: { slug: true },
    orderBy: { order: 'asc' },
  });

  return categories
    .filter((category) => isValidFeedCategorySlug(category.slug))
    .map((category) => ({ category: category.slug }));
}

export async function getFeedPageData(input: GetFeedPageDataInput = {}): Promise<FeedPageData> {
  if (!canReadFeedDatabase()) {
    return {
      categories: [],
      activeCategory: null,
      articlesPage: emptyArticlesPage(),
    };
  }

  const category = normalizeCategory(input.category);
  const categoriesPromise = getFeedCategories();
  const articlesPagePromise = input.category && !category
    ? Promise.resolve(null)
    : getPublicArticles({ category, pageSize: DEFAULT_PAGE_SIZE });
  const [categories, articlesPage] = await Promise.all([categoriesPromise, articlesPagePromise]);

  return {
    categories,
    activeCategory: category ? categories.find((item) => item.slug === category) ?? null : null,
    articlesPage: articlesPage ? serializeArticlesPage(articlesPage) : emptyArticlesPage(),
  };
}
