'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/i18n-navigation';
import { Button } from '@/components/ui/button';

interface BackButtonProps {
  label: string;
  className?: string;
}

export function BackButton({ label, className }: BackButtonProps) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/app');
  }

  return (
    <Button variant="ghost" className={className} onClick={goBack}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
