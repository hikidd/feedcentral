import { dynamic, generateStaticParams, revalidate } from '@/app/[locale]/article/[id]/page';

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));

jest.mock('@/lib/articles/get-public-article', () => ({
  getPublicArticle: jest.fn(),
}));

jest.mock('@/components/reader/ArticleHeader', () => ({
  ArticleHeader: jest.fn(() => null),
}));

jest.mock('@/components/reader/ArticleContent', () => ({
  ArticleContent: jest.fn(() => null),
}));

jest.mock('@/components/reader/BackButton', () => ({
  BackButton: jest.fn(() => null),
}));

describe('ArticlePage static caching', () => {
  it('renders article detail pages as static content without time-based revalidation', () => {
    expect(dynamic).toBe('force-static');
    expect(revalidate).toBe(false);
    expect(generateStaticParams()).toEqual([]);
  });
});
