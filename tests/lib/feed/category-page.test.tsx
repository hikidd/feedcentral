import CategoryPage, { dynamicParams, generateStaticParams, revalidate } from '@/app/[locale]/app/[category]/page';
import { FeedPageClient } from '@/components/feed/FeedPageClient';
import { getFeedCategoryStaticParams, getFeedPageData } from '@/lib/feed/get-feed-page-data';
import { notFound } from 'next/navigation';

jest.mock('@/components/feed/FeedPageClient', () => ({
  FeedPageClient: jest.fn(() => null),
}));

jest.mock('@/lib/feed/get-feed-page-data', () => ({
  getFeedCategoryStaticParams: jest.fn(),
  getFeedPageData: jest.fn(),
  isValidFeedCategorySlug: (category: string) => category.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const mockedFeedPageClient = FeedPageClient as jest.Mock;
const mockedGetFeedCategoryStaticParams = getFeedCategoryStaticParams as jest.MockedFunction<typeof getFeedCategoryStaticParams>;
const mockedGetFeedPageData = getFeedPageData as jest.MockedFunction<typeof getFeedPageData>;
const mockedNotFound = notFound as unknown as jest.Mock;

function emptyArticlesPage() {
  return {
    articles: [],
    page: null,
    pageSize: 20,
    total: null,
    totalPages: null,
    hasNext: false,
    hasPrev: false,
    nextCursor: null,
  };
}

function renderCategory(category: string) {
  return CategoryPage({ params: Promise.resolve({ category }) });
}

describe('CategoryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables on-demand category params', () => {
    expect(dynamicParams).toBe(false);
  });

  it('does not time-revalidate category pages', () => {
    expect(revalidate).toBe(false);
  });

  it('generates static params from known feed categories', async () => {
    mockedGetFeedCategoryStaticParams.mockResolvedValue([{ category: 'tech' }]);

    await expect(generateStaticParams()).resolves.toEqual([{ category: 'tech' }]);

    expect(mockedGetFeedCategoryStaticParams).toHaveBeenCalledWith();
  });

  it('rejects invalid category slugs before loading feed data', async () => {
    await expect(renderCategory('../admin')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockedNotFound).toHaveBeenCalledTimes(1);
    expect(mockedGetFeedPageData).not.toHaveBeenCalled();
  });

  it('rejects overlong category slugs before loading feed data', async () => {
    await expect(renderCategory('a'.repeat(101))).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockedNotFound).toHaveBeenCalledTimes(1);
    expect(mockedGetFeedPageData).not.toHaveBeenCalled();
  });

  it('rejects unknown category slugs instead of rendering cacheable empty pages', async () => {
    mockedGetFeedPageData.mockResolvedValue({
      categories: [],
      activeCategory: null,
      articlesPage: emptyArticlesPage(),
    });

    await expect(renderCategory('unknown-category')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockedGetFeedPageData).toHaveBeenCalledWith({ category: 'unknown-category' });
    expect(mockedNotFound).toHaveBeenCalledTimes(1);
  });

  it('renders known category feed data', async () => {
    const activeCategory = {
      id: 'cat-tech',
      name: 'Tech',
      slug: 'tech',
      icon: 'cpu',
      color: '#000',
      order: 1,
    };
    const articlesPage = emptyArticlesPage();
    mockedGetFeedPageData.mockResolvedValue({
      categories: [activeCategory],
      activeCategory,
      articlesPage,
    });

    const result = await renderCategory('tech');

    expect(result).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          mode: 'category',
          category: 'tech',
          activeCategory,
          initialArticlesPage: articlesPage,
        }),
      })
    );
    expect(mockedFeedPageClient).not.toHaveBeenCalled();
    expect(mockedNotFound).not.toHaveBeenCalled();
  });
});
