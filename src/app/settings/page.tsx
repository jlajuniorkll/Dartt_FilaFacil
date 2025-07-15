
'use client';

import { useEffect, useState } from 'react';
import { getSettings } from '@/lib/data';
import SettingsClient from './SettingsClient';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Header from '@/components/Header';
import { Loader2 } from 'lucide-react';
import type { AppSettings } from '@/lib/types';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';

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
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    // Se o authLoading terminou e o usuário não for admin, redireciona.
    if (!authLoading && ( !user || role !== 'admin')) {
        router.replace('/home');
    }
  }, [user, role, authLoading, router]);

  useEffect(() => {
    // Apenas busca os dados se o usuário for admin.
    if (user && role === 'admin') {
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
    }
  }, [user, role]);

  // AuthProvider já mostra um loader global, então não renderiza nada aqui.
  if (authLoading) {
    return null;
  }
  
  // Se o usuário não for admin, mostra Acesso Negado.
  if (!user || role !== 'admin') {
     return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
         <p>Acesso negado.</p>
       </div>
     );
  }

  // Loader para o conteúdo da página.
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
         <p>{error || 'Erro ao carregar.'}</p>
       </div>
     );
  }

  return <SettingsPageContent settings={settings} />;
}
