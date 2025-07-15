'use client';

import type { AppSettings, Ticket } from '@/lib/types';
import { useState, useTransition } from 'react';
import { callNextTicket, callNextTicketByType, repeatLastCall } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PhoneCall, Repeat } from 'lucide-react';

export default function CallClient({ settings, initialLastCalled }: { settings: AppSettings; initialLastCalled: Ticket | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [lastCalled, setLastCalled] = useState<Ticket | null>(initialLastCalled);

  const handleCall = (action: () => Promise<any>) => {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        if (result.ticket) {
          setLastCalled(result.ticket);
        } else {
          toast({
            title: 'Fila vazia',
            description: 'Não há senhas para chamar.',
          });
        }
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Não foi possível chamar a senha.',
          variant: 'destructive',
        });
      }
    });
  };

  const handleCallNext = () => handleCall(callNextTicket);
  const handleCallByType = (buttonId: string) => handleCall(() => callNextTicketByType(buttonId));
  const handleRepeat = () => {
    if (!lastCalled) {
        toast({ title: 'Nenhuma senha para repetir', description: 'Nenhuma senha foi chamada ainda.'});
        return;
    }
    handleCall(repeatLastCall);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-headline text-2xl">Painel de Chamada</CardTitle>
        <CardDescription>Chame a próxima senha da fila.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center justify-center p-8 md:p-12 bg-muted rounded-lg min-h-[200px]">
          <p className="text-sm text-muted-foreground">Última Senha Chamada</p>
          {lastCalled ? (
            <p className="text-8xl font-bold font-mono text-primary tracking-tight">{lastCalled.ticketNumber}</p>
          ) : (
            <p className="text-3xl font-semibold text-muted-foreground mt-4">Nenhuma senha chamada</p>
          )}
        </div>
        
        {settings.priorityEnabled ? (
          <div className="flex flex-col sm:flex-row gap-4">
            <Button 
              size="lg" 
              className="flex-1 text-lg py-8" 
              onClick={handleCallNext} 
              disabled={isPending}
            >
              {isPending ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <PhoneCall className="mr-2 h-6 w-6" />}
              Chamar Próximo
            </Button>
            <Button 
              size="lg" 
              variant="secondary" 
              className="flex-1 text-lg py-8" 
              onClick={handleRepeat}
              disabled={isPending || !lastCalled}
            >
              <Repeat className="mr-2 h-6 w-6" />
              Repetir Chamada
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {settings.buttons.map(btn => (
              <Button
                key={btn.id}
                size="lg"
                className="text-lg py-6"
                onClick={() => handleCallByType(btn.id)}
                disabled={isPending}
                style={{ backgroundColor: btn.color, color: btn.textColor }}
              >
                {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PhoneCall className="mr-2 h-5 w-5" />}
                Chamar {btn.name}
              </Button>
            ))}
             <Button 
              size="lg" 
              variant="secondary" 
              className="text-lg py-6 sm:col-span-2" 
              onClick={handleRepeat}
              disabled={isPending || !lastCalled}
            >
              <Repeat className="mr-2 h-6 w-6" />
              Repetir Chamada
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
