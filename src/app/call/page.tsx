
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

function CallPageContent({ 
  settings, 
  pendingTickets, 
  lastCalled, 
  refreshData 
}: { 
  settings: AppSettings; 
  pendingTickets: TicketType[]; 
  lastCalled: TicketType | null;
  refreshData: () => void; 
}) {

  return (
    <>
      <Header />
      <div className="container mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
           <CallClient settings={settings} initialLastCalled={lastCalled} onCall={refreshData} />
        </div>
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Fila de Espera</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-full">
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

  const fetchData = React.useCallback(async () => {
    setDataLoading(true);
    try {
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
  }, []);

  React.useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/login');
      } else if (!['admin', 'operator'].includes(role || '')) {
        router.replace('/home'); 
      } else {
        fetchData();
      }
    }
  }, [user, role, authLoading, router, fetchData]);

  if (authLoading || dataLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user || !['admin', 'operator'].includes(role || '')) {
     return null; // Will be redirected by useEffect
  }

  if (error || !data) {
     return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
         <p>{error || 'Erro ao carregar os dados. Tente novamente.'}</p>
       </div>
     )
  }

  return <CallPageContent {...data} refreshData={fetchData} />;
}
