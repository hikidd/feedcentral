'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRequireAdmin } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AddSourceDialog } from '@/components/admin/AddSourceDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/hooks/useToast';
import { getIntlLocale } from '@/lib/locale';
import { Plus, Search, Globe, Power, PowerOff, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';

interface Source {
  id: string;
  name: string;
  url: string;
  feedUrl: string;
  isActive: boolean;
  lastFetchedAt: string | null;
  category: {
    name: string;
    color: string;
  };
  _count: {
    articles: number;
    feedJobs: number;
  };
}

export default function AdminSourcesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user, isLoading: authLoading } = useRequireAdmin();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [fetchingSourceIds, setFetchingSourceIds] = useState<string[]>([]);
  const [deletingSource, setDeletingSource] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSources();
    }
  }, [user]);

  async function fetchSources(options?: { skipMinimumDelay?: boolean }) {
    const shouldEnforceMinimumDelay = !options?.skipMinimumDelay;

    try {
      const startTime = Date.now();
      const response = await fetch('/api/admin/sources');
      const data = await response.json();

      if (data.success) {
        setSources(data.data);
      }

      if (shouldEnforceMinimumDelay) {
        // Ensure minimum loading time of 1 second for smoother UX
        const elapsed = Date.now() - startTime;
        const minLoadTime = 1000;
        if (elapsed < minLoadTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
        }
      }
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSource(id: string, currentStatus: boolean) {
    try {
      const response = await fetch(`/api/admin/sources/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (response.ok) {
        fetchSources();
        toast({
          title: t('common.success'),
          description: !currentStatus ? t('admin.sourcesPage.toggleSuccessActivated') : t('admin.sourcesPage.toggleSuccessDeactivated'),
          variant: 'success',
        });
      } else {
        throw new Error(t('admin.sourcesPage.toggleFailed'));
      }
    } catch (error) {
      console.error('Failed to toggle source:', error);
      toast({
        title: t('common.error'),
        description: t('admin.sourcesPage.toggleFailed'),
        variant: 'destructive',
      });
    }
  }

  async function fetchSourceNow(id: string) {
    setFetchingSourceIds((current) => [...current, id]);

    try {
      const response = await fetch(`/api/admin/sources/${id}/fetch`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || t('admin.sourcesPage.fetchFailed'));
      }

      toast({
        title: t('common.success'),
        description: t('admin.sourcesPage.fetchSuccess', { added: data.data.added, found: data.data.found }),
        variant: 'success',
      });

      await fetchSources();
    } catch (error: any) {
      console.error('Failed to fetch source:', error);
      toast({
        title: t('common.error'),
        description: error.message || t('admin.sourcesPage.fetchFailed'),
        variant: 'destructive',
      });
    } finally {
      setFetchingSourceIds((current) => current.filter((sourceId) => sourceId !== id));
    }
  }

  async function confirmDeleteSource() {
    if (!deletingSource) {
      return;
    }

    const sourceToDelete = deletingSource;

    try {
      setDeleting(true);
      const response = await fetch(`/api/admin/sources/${sourceToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || t('admin.sourcesPage.deleteFailed'));
      }

      setSources((current) => current.filter((source) => source.id !== sourceToDelete.id));
      setDeletingSource(null);
      toast({
        title: t('common.success'),
        description: data.message || t('admin.sourcesPage.deleteSuccess'),
        variant: 'success',
      });
      void fetchSources({ skipMinimumDelay: true });
    } catch (error: any) {
      console.error('Failed to delete source:', error);
      toast({
        title: t('common.error'),
        description: error.message || t('admin.sourcesPage.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }

  const filteredSources = sources.filter(source =>
    source.name.toLowerCase().includes(search.toLowerCase()) ||
    source.url.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-neutral-400">{t('admin.sourcesPage.loading')}</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background px-6 py-8 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <AddSourceDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={fetchSources}
        />

        <Dialog
          open={deletingSource !== null}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setDeletingSource(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-destructive/10 p-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <DialogTitle>{t('admin.sourcesPage.deleteDialog.title')}</DialogTitle>
              </div>
              <DialogDescription className="pt-4">
                {t('admin.sourcesPage.deleteDialog.description')}
              </DialogDescription>
            </DialogHeader>

            {deletingSource && (
              <div className="py-4">
                <div className="rounded-lg border border-border bg-muted p-4">
                  <p className="mb-1 font-medium">{deletingSource.name}</p>
                  <p className="text-sm text-muted-foreground break-all">{deletingSource.url}</p>
                </div>

                <p className="mt-4 text-sm font-medium text-destructive">
                  {t('admin.sourcesPage.deleteDialog.warning')}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeletingSource(null)}
                disabled={deleting}
              >
                {t('admin.sourcesPage.deleteDialog.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteSource}
                disabled={deleting}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? t('admin.sourcesPage.deleteDialog.deleting') : t('admin.sourcesPage.deleteDialog.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('admin.sourcesPage.title')}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t('admin.sourcesPage.subtitle')}
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            {t('admin.sourcesPage.addSource')}
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('admin.sourcesPage.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sources List */}
        <div className="space-y-3">
          {filteredSources.map((source) => {
            const isFetching = fetchingSourceIds.includes(source.id);

            return (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-5 hover:shadow-md transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-semibold text-foreground">{source.name}</h3>
                  <Badge
                    variant={source.isActive ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {source.isActive ? t('admin.sourcesPage.active') : t('admin.sourcesPage.inactive')}
                  </Badge>
                  <Badge
                    style={{
                      backgroundColor: source.category.color + '20',
                      color: source.category.color,
                      borderColor: source.category.color + '40',
                    }}
                    className="text-xs border"
                  >
                    {source.category.name}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="truncate max-w-md">{source.url}</span>
                  </span>
                  <span className="font-medium">{t('admin.sourcesPage.articlesCount', { count: source._count.articles })}</span>
                  {source.lastFetchedAt && (
                    <span>
                      {t('admin.sourcesPage.lastFetched', { date: new Date(source.lastFetchedAt).toLocaleDateString(getIntlLocale(locale)) })}
                    </span>
                  )}
                </div>
              </div>

              <div className="ml-4 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchSourceNow(source.id)}
                  className="gap-2"
                  disabled={isFetching || !source.isActive || deleting}
                >
                  <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                  {isFetching ? t('admin.sourcesPage.fetching') : t('admin.sourcesPage.fetchNow')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSource(source.id, source.isActive)}
                  className="gap-2"
                  disabled={deleting}
                >
                  {source.isActive ? (
                    <>
                      <PowerOff className="w-4 h-4" />
                      {t('admin.sourcesPage.deactivate')}
                    </>
                  ) : (
                    <>
                      <Power className="w-4 h-4" />
                      {t('admin.sourcesPage.activate')}
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeletingSource(source)}
                  className="gap-2"
                  disabled={deleting}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('admin.sourcesPage.delete')}
                </Button>
              </div>
            </div>
            );
          })}

          {filteredSources.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">{t('admin.sourcesPage.noSourcesFound')}</p>
              <p className="text-sm mt-1">
                {search ? t('admin.sourcesPage.adjustSearch') : t('admin.sourcesPage.emptyCta')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
