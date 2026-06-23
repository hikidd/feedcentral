import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getPublicArticle } from '@/lib/articles/get-public-article';
import { ArticleHeader } from '@/components/reader/ArticleHeader';
import { ArticleContent } from '@/components/reader/ArticleContent';
import { BackButton } from '@/components/reader/BackButton';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateStaticParams() {
  return [];
}

export default async function ArticlePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [article, t] = await Promise.all([
    getPublicArticle(id),
    getTranslations({ locale, namespace: 'article' }),
  ]);
  const backLabel = t('notFound.action');

  if (!article) {
    notFound();
  }

  return (
    <div className="content-container px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <BackButton label={backLabel} className="mb-6 -ml-2" />
        <ArticleHeader article={article} locale={locale} />

        {article.content && (
          <div className="mt-8 border-t border-border pt-8">
            <ArticleContent content={article.content} />
          </div>
        )}
      </div>
    </div>
  );
}
