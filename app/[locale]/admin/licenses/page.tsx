'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Key, Copy, Check, AlertTriangle, Shield } from 'lucide-react';
import { getIntlLocale } from '@/lib/locale';

interface GeneratedKey {
  id: string;
  key: string;
  tier: string;
  duration: number;
  issuedAt: string;
}

export default function AdminLicensesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { toast } = useToast();
  
  const [tier, setTier] = useState<'premium' | 'pro'>('premium');
  const [duration, setDuration] = useState<number>(365);
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKey[]>([]);
  const [copiedKeys, setCopiedKeys] = useState<Set<string>>(new Set());

  const handleGenerate = async () => {
    try {
      setGenerating(true);

      const response = await fetch('/api/admin/licenses/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, duration, quantity, notes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('admin.licensesPage.generateFailed'));
      }

      setGeneratedKeys(data.keys);
      toast({
        title: t('common.success'),
        description: data.message,
      });

      // Reset form
      setNotes('');
      setQuantity(1);

    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKeys(prev => new Set(prev).add(key));
      
      toast({
        title: t('admin.licensesPage.copySuccessTitle'),
        description: t('admin.licensesPage.copySuccessDescription'),
      });

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedKeys(prev => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
      }, 2000);
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('admin.licensesPage.copyFailed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{t('admin.licensesPage.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('admin.licensesPage.subtitle')}
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-yellow-500">{t('admin.licensesPage.securityTitle')}</p>
            <p className="text-muted-foreground mt-1">
              {t('admin.licensesPage.securityDescription')}
            </p>
          </div>
        </div>

        {/* Generation Form */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('admin.licensesPage.generateTitle')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tier Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('admin.licensesPage.licenseTier')}</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as 'premium' | 'pro')}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
                disabled={generating}
              >
                <option value="premium">{t('admin.licensesPage.premiumOption')}</option>
                <option value="pro">{t('admin.licensesPage.proOption')}</option>
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('admin.licensesPage.durationDays')}</label>
              <Input
                type="number"
                min="1"
                max="3650"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 365)}
                disabled={generating}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('admin.licensesPage.durationHint', {
                  days: duration,
                  months: Math.round(duration / 30),
                  years: Math.round(duration / 365),
                })}
              </p>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('admin.licensesPage.quantity')}</label>
              <Input
                type="number"
                min="1"
                max="100"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                disabled={generating}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('admin.licensesPage.notes')}</label>
              <Input
                type="text"
                placeholder={t('admin.licensesPage.notesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={generating}
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full"
          >
            {generating
              ? t('admin.licensesPage.generating')
              : quantity > 1
                ? t('admin.licensesPage.generateMany', { count: quantity })
                : t('admin.licensesPage.generateOne')}
          </Button>
        </div>

        {/* Generated Keys Display */}
        {generatedKeys.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold">{t('admin.licensesPage.generatedTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('admin.licensesPage.generatedDescription')}
            </p>

            <div className="space-y-2">
              {generatedKeys.map((keyData) => (
                <div
                  key={keyData.id}
                  className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-lg"
                >
                  <div className="flex-1 font-mono text-sm">
                    <div className="font-bold text-primary">{keyData.key}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {keyData.tier.toUpperCase()} • {keyData.duration} {t('admin.licensesPage.durationDays').replace(' (days)', '').replace('（天）', '')} •
                      {t('admin.licensesPage.issuedOn', { date: new Date(keyData.issuedAt).toLocaleDateString(getIntlLocale(locale)) })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(keyData.key)}
                  >
                    {copiedKeys.has(keyData.key) ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        {t('admin.licensesPage.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        {t('admin.licensesPage.copy')}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Information Panel */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-3">
          <h3 className="font-semibold">{t('admin.licensesPage.howItWorks')}</h3>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li>{t('admin.licensesPage.bullets.format')} <code className="bg-muted px-1 py-0.5 rounded">FEED-XXXX-XXXX-XXXX-XXXX</code></li>
            <li>{t('admin.licensesPage.bullets.redeemOnce')}</li>
            <li>{t('admin.licensesPage.bullets.boundInstance')}</li>
            <li>{t('admin.licensesPage.bullets.instanceId')}</li>
            <li>{t('admin.licensesPage.bullets.differentInstance')}</li>
            <li>{t('admin.licensesPage.bullets.duration')}</li>
            <li>{t('admin.licensesPage.bullets.revoked')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
