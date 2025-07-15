'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { getSettings } from '@/lib/data';
import SettingsClient from './SettingsClient';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Header from '@/components/Header';
import { Loader2 } from 'lucide-react';
import type { AppSettings } from '@/lib/types';


function SettingsPageContent({ settings }: { settings: AppSettings }) {
  return (
     <>
      <Header />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Configurações do Sistema</CardTitle>
            <CardDescription>
              Personalize os botões de senha, vídeos e outras opções. As alterações são salvas automaticamente.
            </CardDescription>
          </CardHeader>
          <SettingsClient initialSettings={settings} />
        </Card>
      </div>
    </>
  )
}

export default function SettingsPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (!loading) {
      if (!user || role !== 'admin') {
        router.push('/login');
      } else {
        getSettings().then(setSettings);
      }
    }
  }, [user, role, loading, router]);

  if (loading || !settings) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return <SettingsPageContent settings={settings} />;
}
