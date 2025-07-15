'use client';

import { useEffect, useState } from 'react';
import { getSettings } from '@/lib/data';
import SettingsClient from './SettingsClient';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Header from '@/components/Header';
import { Loader2 } from 'lucide-react';
import type { AppSettings } from '@/lib/types';
import withAuth from '@/lib/auth/with-auth';

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

function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        setLoading(true);
        const data = await getSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to fetch settings:", err);
        setError("Não foi possível carregar as configurações.");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !settings) {
     return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
         <p>{error || 'Ocorreu um erro.'}</p>
       </div>
     );
  }

  return <SettingsPageContent settings={settings} />;
}

export default withAuth(SettingsPage, ['admin']);
