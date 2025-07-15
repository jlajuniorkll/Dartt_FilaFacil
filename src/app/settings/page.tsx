
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSettings } from '@/lib/data';
import SettingsClient from './SettingsClient';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Header from '@/components/Header';
import { Loader2 } from 'lucide-react';
import type { AppSettings } from '@/lib/types';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';

function SettingsPageContent({ settings, onSettingsChange }: { settings: AppSettings, onSettingsChange: () => void }) {
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
          <SettingsClient initialSettings={settings} onSettingsChange={onSettingsChange} />
        </Card>
      </div>
    </>
  )
}

export default function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  const fetchSettings = useCallback(async () => {
      setDataLoading(true);
      try {
        const data = await getSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to fetch settings:", err);
        setError("Não foi possível carregar as configurações.");
      } finally {
        setDataLoading(false);
      }
    }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/login');
      } else if (role !== 'admin') {
        router.replace('/home');
      }
    }
  }, [user, role, authLoading, router]);

  useEffect(() => {
    if (user && role === 'admin') {
      fetchSettings();
    }
  }, [user, role, fetchSettings]);

  if (authLoading || dataLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user || role !== 'admin') {
     return null; 
  }

  if (error || !settings) {
     return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
         <p>{error || 'Erro ao carregar.'}</p>
       </div>
     );
  }

  return <SettingsPageContent settings={settings} onSettingsChange={fetchSettings} />;
}
