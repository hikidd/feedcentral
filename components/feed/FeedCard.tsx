"use client";

import { Calendar, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { Link } from '@/i18n-navigation';
import { Article } from '@/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { decodeHtmlEntities } from '@/lib/decode-html';
import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getIntlLocale } from '@/lib/locale';

interface FeedCardProps {
  article: Article;
  index?: number;
}

export function FeedCard({ article, index = 0 }: FeedCardProps) {
  const t = useTranslations('feed');
  const locale = useLocale();
  const [imgError, setImgError] = useState(false);
  const formattedDate = new Date(article.publishedAt).toLocaleDateString(getIntlLocale(locale), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Priority loading for first 3 articles (above the fold)
  const isPriority = index < 3;

  const hasRemoteImage = !!article.imageUrl;
  const proxySrc = `/api/image-proxy/${article.id}`;

  useEffect(() => {
    setImgError(false);
  }, [proxySrc]);

  const shouldShowImage = hasRemoteImage && !imgError;

  return (
    <article className="group">
      <Link
        href={`/article/${article.id}`}
        className={cn(
          'block rounded-xl border border-border/50 bg-card p-4 transition-all duration-150',
          'hover:border-border hover:shadow-lg hover:shadow-black/5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        <div className="flex gap-4">
          <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
            {shouldShowImage ? (
              <Image
                src={proxySrc}
                alt={article.title}
                fill
                onError={() => setImgError(true)}
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 128px, 128px"
                priority={isPriority}
                loading={isPriority ? undefined : "lazy"}
                fetchPriority={isPriority ? "high" : "low"}
              />
            ) : hasRemoteImage ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground">
                <div>{t('imageRemovedForSecurity')}</div>
                <button
                  type="button"
                  onClick={() => window.open(article.url, '_blank', 'noopener')}
                  className="mt-1 text-xs text-primary underline"
                >
                  {t('openOriginalArticle')}
                </button>
              </div>
            ) : null}
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col gap-2">
            {/* Title */}
            <h3 className="line-clamp-2 text-base font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
              {decodeHtmlEntities(article.title)}
            </h3>

            {/* Description */}
            {article.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {decodeHtmlEntities(article.description)}
              </p>
            )}

            {/* Meta */}
            <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-normal">
                {article.source.name}
              </Badge>
              
              {article.category && (
                <Badge variant="outline" className="font-normal">
                  {article.category.name}
                </Badge>
              )}

              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <time dateTime={typeof article.publishedAt === 'string' ? article.publishedAt : article.publishedAt.toISOString()}>{formattedDate}</time>
              </div>

              {article.author && (
                <span className="hidden sm:inline">{t('by', { author: article.author })}</span>
              )}
            </div>
          </div>

          {/* External link indicator */}
          <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </Link>
    </article>
  );
}
