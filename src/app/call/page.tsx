import { getSettings, getPendingTickets, getQueueStatus } from '@/lib/data';
import CallClient from './CallClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Ticket } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CallPage() {
  const settings = await getSettings();
  const pendingTickets = await getPendingTickets();
  const { lastCalled } = await getQueueStatus();

  return (
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
  );
}
