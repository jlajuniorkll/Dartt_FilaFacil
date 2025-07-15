
'use client';

import * as React from 'react';
import { getSettings, getPendingTickets, getQueueStatus } from '@/lib/data';
import CallClient from './CallClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Ticket, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import type { AppSettings, Ticket as TicketType } from '@/lib/types';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';

function CallPageContent({ settings, pendingTickets, lastCalled }: { settings: AppSettings; pendingTickets: TicketType[]; lastCalled: TicketType | null; }) {
  return (
    <>
      <Header />
      <div className="container mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
           <CallClient settings={settings} initialLastCalled={lastCalled} />
        </div>
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Fila de Espera</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-16rem)]">
                {pendingTickets.length > 0 ? (
                   <ul className="space-y-2">
                    {pendingTickets.map(ticket => (
                      <li key={ticket.id} className="flex items-center justify-between p-3 bg-muted rounded-md">
                         <div className="flex items-center gap-3">
                           <Ticket className="h-5 w-5 text-primary" />
                           <span className="font-semibold font-mono text-lg">{ticket.ticketNumber}</span>
                         </div>
                         <span className="text-xs text-muted-foreground">
                           {new Date(ticket.timestamp).toLocaleTimeString('pt-BR')}
                         </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-center p-8">Nenhuma senha aguardando.</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function CallPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = React.useState<{ settings: AppSettings; pendingTickets: TicketType[]; lastCalled: TicketType | null; } | null>(null);
  const [dataLoading, setDataLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Apenas toma uma decisão depois que a autenticação foi verificada
    if (!authLoading) {
      if (!user) {
        router.replace('/login');
      } else if (!['admin', 'operator'].includes(role || '')) {
        router.replace('/home'); // Não tem permissão, volta para a home
      }
    }
  }, [user, role, authLoading, router]);

  React.useEffect(() => {
    // Apenas busca os dados se o usuário tiver permissão
    if (user && ['admin', 'operator'].includes(role || '')) {
      async function fetchData() {
        try {
          setDataLoading(true);
          const [settings, pendingTickets, { lastCalled }] = await Promise.all([
            getSettings(),
            getPendingTickets(),
            getQueueStatus()
          ]);
          setData({ settings, pendingTickets, lastCalled });
        } catch (err) {
          console.error("Failed to fetch call page data:", err);
          setError('Erro ao carregar os dados. Tente novamente mais tarde.');
        } finally {
          setDataLoading(false);
        }
      }
      fetchData();
    }
  }, [user, role]);

  // Enquanto a autenticação está carregando, o AuthProvider já mostra um loader.
  if (authLoading) {
    return null;
  }
  
  // Se não tem permissão, será redirecionado pelo useEffect. Renderiza null para evitar flash.
  if (!user || !['admin', 'operator'].includes(role || '')) {
     return null;
  }
  
  // Loader para os dados da página
  if (dataLoading) {
    return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
     return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
         <p>{error || 'Erro ao carregar os dados. Tente novamente.'}</p>
       </div>
     )
  }

  return <CallPageContent {...data} />;
}
