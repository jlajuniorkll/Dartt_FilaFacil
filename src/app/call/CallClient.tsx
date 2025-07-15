
'use client';

import type { AppSettings, Ticket } from '@/lib/types';
import { useState, useTransition, useEffect } from 'react';
import { callNextTicket, callNextTicketByType, repeatLastCall } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PhoneCall, Repeat } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function CallClient({ 
  settings, 
  initialLastCalled, 
  onCall 
}: { 
  settings: AppSettings; 
  initialLastCalled: Ticket | null;
  onCall: () => void; 
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [lastCalled, setLastCalled] = useState<Ticket | null>(initialLastCalled);
  const [selectedCounter, setSelectedCounter] = useState<string | undefined>(undefined);

  useEffect(() => {
    setLastCalled(initialLastCalled);
  }, [initialLastCalled]);

  useEffect(() => {
    const savedCounter = localStorage.getItem('selectedCounter');
    if (savedCounter && Number(savedCounter) <= settings.totalCounters) {
      setSelectedCounter(savedCounter);
    }
  }, [settings.totalCounters]);
  
  const handleCounterChange = (value: string) => {
    setSelectedCounter(value);
    localStorage.setItem('selectedCounter', value);
  }

  const handleAction = (action: (counter: number) => Promise<any>) => {
    if (!selectedCounter) {
        toast({
            title: 'Selecione um guichê',
            description: 'Você precisa selecionar um guichê antes de chamar uma senha.',
            variant: 'destructive'
        });
        return;
    }
    const counterNumber = parseInt(selectedCounter, 10);
    startTransition(async () => {
      const result = await action(counterNumber);
      if (result.success) {
        if (result.ticket) {
          setLastCalled(result.ticket);
        } else {
           toast({
            title: 'Fila vazia',
            description: 'Não há senhas para chamar.',
          });
        }
        onCall(); // Refresh data on parent
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Não foi possível chamar a senha.',
          variant: 'destructive',
        });
      }
    });
  };
  
  const handleActionNoCounter = (action: () => Promise<any>) => {
     startTransition(async () => {
      const result = await action();
      if (result.success) {
        if (result.ticket) {
          setLastCalled(result.ticket);
        }
        onCall(); // Refresh data on parent
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Não foi possível repetir a chamada.',
          variant: 'destructive',
        });
      }
    });
  }

  const handleCallNext = () => handleAction(callNextTicket);
  const handleCallByType = (buttonId: string) => {
    handleAction((counter) => callNextTicketByType(buttonId, counter));
  }
  const handleRepeat = () => {
    if (!lastCalled && !initialLastCalled) {
        toast({ title: 'Nenhuma senha para repetir', description: 'Nenhuma senha foi chamada ainda.'});
        return;
    }
    handleActionNoCounter(repeatLastCall);
  }

  const displayLastCalled = lastCalled || initialLastCalled;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-headline text-2xl">Painel de Chamada</CardTitle>
        <CardDescription>Selecione seu guichê e chame a próxima senha da fila.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        <div className="space-y-2">
            <Label htmlFor="counter-select">Seu Guichê</Label>
            <Select 
              value={selectedCounter} 
              onValueChange={handleCounterChange}
              disabled={settings.totalCounters <= 0}
            >
                <SelectTrigger id="counter-select" className="w-full md:w-1/2">
                    <SelectValue placeholder={settings.totalCounters > 0 ? "Selecione o número do seu guichê" : "Nenhum guichê configurado"} />
                </SelectTrigger>
                <SelectContent>
                    {Array.from({ length: settings.totalCounters }, (_, i) => i + 1).map(counterNum => (
                        <SelectItem key={counterNum} value={String(counterNum)}>
                            Guichê {counterNum}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>


        <div className="flex flex-col items-center justify-center p-8 md:p-12 bg-muted rounded-lg min-h-[200px]">
          <p className="text-sm text-muted-foreground">Última Senha Chamada</p>
          {displayLastCalled ? (
            <div className="text-center">
              <p className="text-8xl font-bold font-mono text-primary tracking-tight">{displayLastCalled.ticketNumber}</p>
              {displayLastCalled.counter && <p className="text-2xl font-semibold text-muted-foreground mt-2">no Guichê {displayLastCalled.counter}</p>}
            </div>
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
              disabled={isPending || !selectedCounter}
            >
              {isPending ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <PhoneCall className="mr-2 h-6 w-6" />}
              Chamar Próximo
            </Button>
            <Button 
              size="lg" 
              variant="secondary" 
              className="flex-1 text-lg py-8" 
              onClick={handleRepeat}
              disabled={isPending || !displayLastCalled}
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
                disabled={isPending || !selectedCounter}
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
              disabled={isPending || !displayLastCalled}
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
