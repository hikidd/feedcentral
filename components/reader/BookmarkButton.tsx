'use client';

import { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useRouter } from '@/i18n-navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks/useAuth';

interface BookmarkButtonLabels {
  bookmark: string;
  removeBookmark: string;
  signInToBookmark: string;
}

interface BookmarkButtonProps {
  articleId: string;
  labels: BookmarkButtonLabels;
}

interface BookmarksResponse {
  success: boolean;
  data?: Array<{ articleId?: string | null }>;
  error?: string;
}

export function BookmarkButton({ articleId, labels }: BookmarkButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsBookmarked(false);
      return;
    }

    let cancelled = false;

    async function checkBookmarkStatus() {
      try {
        const response = await fetch('/api/bookmarks');
        const data = (await response.json()) as BookmarksResponse;

        if (data.success && !cancelled) {
          setIsBookmarked(data.data?.some((bookmark) => bookmark.articleId === articleId) ?? false);
        }
      } catch (error) {
        console.error('Failed to check bookmark status:', error);
      }
    }

    void checkBookmarkStatus();

    return () => {
      cancelled = true;
    };
  }, [articleId, user]);

  async function toggleBookmark() {
    if (!user) {
      router.push('/login');
      return;
    }

    setBookmarkLoading(true);

    try {
      const method = isBookmarked ? 'DELETE' : 'POST';
      const response = await fetch('/api/bookmarks', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });

      const data = (await response.json()) as BookmarksResponse;

      if (data.success) {
        setIsBookmarked((current) => !current);
      } else {
        console.error('Failed to toggle bookmark:', data.error);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    } finally {
      setBookmarkLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleBookmark}
      disabled={bookmarkLoading}
      title={user ? (isBookmarked ? labels.removeBookmark : labels.bookmark) : labels.signInToBookmark}
    >
      {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </Button>
  );
}
