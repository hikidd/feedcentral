'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRequireAdmin } from '@/lib/hooks/useAuth';
import { Settings as SettingsIcon, Save, RefreshCw, Database, Key, Globe, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SettingsPage() {
  const t = useTranslations();
  const { user, isLoading: authLoading } = useRequireAdmin();
  const [activeSection, setActiveSection] = useState('general');
  const [settings, setSettings] = useState({
    siteName: 'FeedCentral',
    siteUrl: 'http://localhost:3000',
    defaultFetchInterval: 30,
    maxArticlesPerFeed: 100,
    enableNotifications: true,
    autoRefreshFeeds: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">{t('admin.settingsPage.loading')}</div>
      </div>
    );
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveMessage('');
    
    try {
      // Simulate API call - implement actual save logic later
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaveMessage(t('admin.settingsPage.saveSuccess'));
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage(t('admin.settingsPage.saveError'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-8 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t('admin.settingsPage.headerTitle')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('admin.settingsPage.headerSubtitle')}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="rounded-lg border border-border bg-card">
              <div className="p-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('admin.settingsPage.sidebarTitle')}</h3>
              </div>
              <nav className="space-y-1">
                {[
                  { icon: Globe, label: t('admin.settingsPage.sections.general'), id: 'general', available: true },
                  { icon: Database, label: t('admin.settingsPage.sections.feedConfiguration'), id: 'feed', available: false },
                  { icon: Bell, label: t('admin.settingsPage.sections.notifications'), id: 'notifications', available: false },
                  { icon: Key, label: t('admin.settingsPage.sections.apiKeys'), id: 'api', available: false },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      disabled={!item.available}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        activeSection === item.id
                          ? 'bg-muted text-foreground'
                          : item.available
                          ? 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          : 'text-muted-foreground/50 cursor-not-allowed'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {!item.available && (
                        <span className="text-xs rounded-full bg-muted px-2 py-0.5">{t('admin.settingsPage.sections.soon')}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {activeSection === 'general' ? (
              <div className="space-y-6">
                {/* General Settings */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">{t('admin.settingsPage.general.title')}</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        {t('admin.settingsPage.general.siteNameLabel')}
                      </label>
                      <Input
                        type="text"
                        value={settings.siteName}
                        onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                        placeholder="FeedCentral"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('admin.settingsPage.general.siteNameDescription')}
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        {t('admin.settingsPage.general.siteUrlLabel')}
                      </label>
                      <Input
                        type="url"
                        value={settings.siteUrl}
                        onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
                        placeholder="https://feedcentral.example.com"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('admin.settingsPage.general.siteUrlDescription')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center gap-4">
                  <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                    {isSaving ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        {t('admin.settingsPage.savingButton')}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {t('admin.settingsPage.saveButton')}
                      </>
                    )}
                  </Button>
                  {saveMessage && (
                    <span
                      className={`text-sm ${
                        saveMessage.includes('success') ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {saveMessage}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* Coming Soon Placeholder */
              <div className="rounded-lg border border-border bg-card p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-muted p-6 mb-4">
                    {activeSection === 'feed' && <Database className="h-12 w-12 text-muted-foreground" />}
                    {activeSection === 'notifications' && <Bell className="h-12 w-12 text-muted-foreground" />}
                    {activeSection === 'api' && <Key className="h-12 w-12 text-muted-foreground" />}
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {t('admin.settingsPage.comingSoonTitle')}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {t('admin.settingsPage.comingSoonDescription')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
