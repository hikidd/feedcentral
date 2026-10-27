'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/hooks/useToast';
import { Loader2 } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  color: string;
}

interface EditableSource {
  id: string;
  name: string;
  url: string;
  feedUrl: string;
  categoryId: string;
  category: {
    id: string;
    name: string;
    color: string;
  };
}

interface EditSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  source: EditableSource | null;
  categories: Category[];
}

export function EditSourceDialog({
  open,
  onOpenChange,
  onSuccess,
  source,
  categories,
}: EditSourceDialogProps) {
  const t = useTranslations();
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    feedUrl: '',
    categoryId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a different source is opened
  useEffect(() => {
    if (open && source) {
      setFormData({
        name: source.name,
        url: source.url,
        feedUrl: source.feedUrl,
        categoryId: source.categoryId || source.category?.id || '',
      });
      setError(null);
    }
  }, [open, source]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!source) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          url: formData.url.trim(),
          feedUrl: formData.feedUrl.trim(),
          categoryId: formData.categoryId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: t('common.success'),
          description: t('admin.sourcesPage.editDialog.success'),
          variant: 'success',
        });

        onSuccess();
        onOpenChange(false);
        return;
      }

      const message = data.message || data.error || t('admin.sourcesPage.editDialog.error');
      setError(message);
      toast({
        title: t('common.error'),
        description: message,
        variant: 'destructive',
      });
    } catch (err) {
      console.error('Failed to update source:', err);
      const message = t('admin.sourcesPage.editDialog.networkError');
      setError(message);
      toast({
        title: t('common.error'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('admin.sourcesPage.editDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('admin.sourcesPage.editDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="edit-name" className="text-sm font-medium">
                {t('admin.sourcesPage.editDialog.nameLabel')}
              </label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-url" className="text-sm font-medium">
                {t('admin.sourcesPage.editDialog.urlLabel')}
              </label>
              <Input
                id="edit-url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-feedUrl" className="text-sm font-medium">
                {t('admin.sourcesPage.editDialog.feedUrlLabel')}
              </label>
              <Input
                id="edit-feedUrl"
                type="url"
                value={formData.feedUrl}
                onChange={(e) => setFormData({ ...formData, feedUrl: e.target.value })}
                required
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                {t('admin.sourcesPage.editDialog.feedUrlHint')}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-category" className="text-sm font-medium">
                {t('admin.sourcesPage.editDialog.categoryLabel')}
              </label>
              <select
                id="edit-category"
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
                disabled={loading}
              >
                <option value="">{t('admin.sourcesPage.editDialog.categoryPlaceholder')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
