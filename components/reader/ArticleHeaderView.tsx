import { Calendar, ExternalLink } from 'lucide-react';
import { Link } from '@/i18n-navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { decodeHtmlEntities } from '@/lib/decode-html';
import { normalizeHttpUrl } from '@/lib/safe-url';
import { BookmarkButton } from '@/components/reader/BookmarkButton';

export interface ArticleHeaderViewArticle {
  id: string;
  title: string;
  author?: string | null;
  publishedAt: Date | string;
  url: string;
  source: {
    name: string;
  };
  category: {
    name: string;
  };
}

interface ArticleHeaderViewLabels {
  readOn: string;
  bookmark: string;
  removeBookmark: string;
  signInToBookmark: string;
  author?: string | null;
}

interface ArticleHeaderViewProps {
  article: ArticleHeaderViewArticle;
  formattedDate: string;
  labels: ArticleHeaderViewLabels;
}

function getArticleDateTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function ArticleHeaderView({ article, formattedDate, labels }: ArticleHeaderViewProps) {
  const articleUrl = normalizeHttpUrl(article.url);

  return (
    <header className="mb-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{article.source.name}</Badge>
        <Badge variant="outline">{article.category.name}</Badge>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <time dateTime={getArticleDateTime(article.publishedAt)}>{formattedDate}</time>
        </div>
      </div>

      <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {decodeHtmlEntities(article.title)}
      </h1>

      {labels.author && <p className="mb-6 text-sm text-muted-foreground">{labels.author}</p>}

      <div className="flex gap-2">
        {articleUrl && (
          <Button asChild className="gap-2">
            <Link href={articleUrl} target="_blank" rel="noopener noreferrer">
              {labels.readOn}
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        )}

        <BookmarkButton
          articleId={article.id}
          labels={{
            bookmark: labels.bookmark,
            removeBookmark: labels.removeBookmark,
            signInToBookmark: labels.signInToBookmark,
          }}
        />
      </div>
    </header>
  );
}
