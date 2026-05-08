import { getTranslations } from 'next-intl/server';
import { BackButton } from '@/components/reader/BackButton';

export default async function ArticleNotFound() {
  const t = await getTranslations('article');

  return (
    <div className="content-container px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mb-4 text-2xl font-bold">{t('notFound.title')}</h1>
        <p className="mb-6 text-muted-foreground">{t('notFound.description')}</p>
        <BackButton label={t('notFound.action')} />
      </div>
    </div>
  );
}
