"use client";

import { Calendar, ExternalLink } from 'lucide-react';
import { Link } from '@/i18n-navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { decodeHtmlEntities } from '@/lib/decode-html';
import { DEFAULT_ARTICLE_IMAGE_SRC, getFeedCardImageSrc } from '@/lib/feed/feed-card-image';
import type { FeedArticle } from '@/lib/feed/get-feed-page-data';
import { useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getIntlLocale } from '@/lib/locale';

const READ_ARTICLES_STORAGE_KEY = 'feedcentral-read-articles';
const READ_ARTICLES_CHANGE_EVENT = 'feedcentral-read-articles-change';
const READ_ARTICLES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const READ_ARTICLES_MAX_COUNT = 500;

type ReadArticleMap = Record<string, number>;

function pruneReadArticles(readArticles: ReadArticleMap, now = Date.now()): ReadArticleMap {
  const cutoff = now - READ_ARTICLES_MAX_AGE_MS;

  return Object.fromEntries(
    Object.entries(readArticles)
      .filter(([articleId, readAt]) => articleId && Number.isFinite(readAt) && readAt >= cutoff)
      .sort(([, readAtA], [, readAtB]) => readAtB - readAtA)
      .slice(0, READ_ARTICLES_MAX_COUNT)
  );
}

function parseReadArticles(raw: string | null): ReadArticleMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const readArticles: ReadArticleMap = {};
    for (const [articleId, readAt] of Object.entries(parsed)) {
      if (typeof readAt === 'number') {
        readArticles[articleId] = readAt;
      }
    }

    return pruneReadArticles(readArticles);
  } catch {
    return {};
  }
}

function getReadArticlesSnapshot() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(READ_ARTICLES_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function getReadArticlesServerSnapshot() {
  return '';
}

function subscribeToReadArticles(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === READ_ARTICLES_STORAGE_KEY || event.key === null) {
      onStoreChange();
    }
  }

  window.addEventListener('storage', handleStorage);
  window.addEventListener(READ_ARTICLES_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(READ_ARTICLES_CHANGE_EVENT, onStoreChange);
  };
}

function getStoredReadArticles(): ReadArticleMap {
  return parseReadArticles(getReadArticlesSnapshot());
}

function saveStoredReadArticles(readArticles: ReadArticleMap) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(READ_ARTICLES_STORAGE_KEY, JSON.stringify(pruneReadArticles(readArticles)));
    window.dispatchEvent(new Event(READ_ARTICLES_CHANGE_EVENT));
  } catch {
    return;
  }
}

function isArticleRead(articleId: string, readArticlesSnapshot: string) {
  return Boolean(parseReadArticles(readArticlesSnapshot)[articleId]);
}

function markStoredArticleRead(articleId: string) {
  saveStoredReadArticles({
    ...getStoredReadArticles(),
    [articleId]: Date.now(),
  });
}

interface FeedCardProps {
  article: FeedArticle;
  index?: number;
}

export function FeedCard({ article, index = 0 }: FeedCardProps) {
  const t = useTranslations('feed');
  const locale = useLocale();
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const readArticlesSnapshot = useSyncExternalStore(
    subscribeToReadArticles,
    getReadArticlesSnapshot,
    getReadArticlesServerSnapshot
  );
  const isRead = isArticleRead(article.id, readArticlesSnapshot);
  const formattedDate = new Date(article.publishedAt).toLocaleString(getIntlLocale(locale), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Priority loading for first 3 articles (above the fold)
  const isPriority = index < 3;

  const imageSrc = getFeedCardImageSrc(article);
  const displayedImageSrc = failedImageSrc === imageSrc ? DEFAULT_ARTICLE_IMAGE_SRC : imageSrc;

  function handleArticleClick() {
    markStoredArticleRead(article.id);
  }

  return (
    <article className="group">
      <Link
        href={`/article/${encodeURIComponent(article.id)}`}
        onClick={handleArticleClick}
        className={cn(
          'block rounded-xl border border-border/50 bg-card p-4 transition-all duration-150',
          'hover:border-border hover:shadow-lg hover:shadow-black/5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        <div className="flex gap-4">
          <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayedImageSrc}
              alt={displayedImageSrc === DEFAULT_ARTICLE_IMAGE_SRC ? '' : article.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading={isPriority ? 'eager' : 'lazy'}
              fetchPriority={isPriority ? 'high' : 'low'}
              referrerPolicy="no-referrer"
              onError={() => {
                if (displayedImageSrc !== DEFAULT_ARTICLE_IMAGE_SRC) {
                  setFailedImageSrc(imageSrc);
                }
              }}
            />
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col gap-2">
            {/* Title */}
            <h3
              className={cn(
                'line-clamp-2 text-base font-medium leading-snug transition-colors',
                isRead ? 'text-foreground/60 group-hover:text-foreground/70' : 'text-foreground group-hover:text-primary'
              )}
            >
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
                <time dateTime={article.publishedAt}>{formattedDate}</time>
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
