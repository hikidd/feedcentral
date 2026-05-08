import { getTranslations } from 'next-intl/server';
import { getIntlLocale } from '@/lib/locale';
import { decodeHtmlEntities } from '@/lib/decode-html';
import { ArticleHeaderView } from '@/components/reader/ArticleHeaderView';
import type { PublicArticle } from '@/lib/articles/article-query';

interface ArticleHeaderProps {
  article: PublicArticle;
  locale: string;
}

export async function ArticleHeader({ article, locale }: ArticleHeaderProps) {
  const t = await getTranslations({ locale, namespace: 'article' });
  const formattedDate = new Date(article.publishedAt).toLocaleDateString(getIntlLocale(locale), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <ArticleHeaderView
      article={article}
      formattedDate={formattedDate}
      labels={{
        readOn: t('readOn', { source: article.source.name }),
        bookmark: t('bookmark'),
        removeBookmark: t('removeBookmark'),
        signInToBookmark: t('signInToBookmark'),
        author: article.author ? t('by', { author: decodeHtmlEntities(article.author) }) : null,
      }}
    />
  );
}
