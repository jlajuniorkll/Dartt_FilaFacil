
'use client';

import type { Ticket } from '@/lib/types';
import { useState, useTransition, useEffect, useCallback } from 'react';
import { generateTicket } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Ticket as TicketIcon } from 'lucide-react';

function PrintableTicketContent({ ticket }: { ticket: Ticket | null }) {
  if (!ticket) return null;

  return (
    <div className="p-2 text-black bg-white" style={{ fontFamily: 'monospace', width: '60mm', boxSizing: 'border-box' }}>
      <div className="text-center">
        <h1 className="text-lg font-bold">PROCON</h1>
        <p className="text-xs">--------------------------------</p>
        <p className="text-sm my-2">Sua Senha:</p>
        <p className="text-5xl font-bold tracking-widest my-4">{ticket.ticketNumber}</p>
        <p className="text-xs">--------------------------------</p>
        <p className="text-xs">
          Emitido em: {new Date(ticket.timestamp).toLocaleDateString('pt-BR')} às {new Date(ticket.timestamp).toLocaleTimeString('pt-BR')}
        </p>
        <p className="text-sm font-bold mt-4">Aguarde sua chamada no painel.</p>
      </div>
    </div>
  );
}


export default function RequestClient({ buttons }: { buttons: any[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [generatedTicket, setGeneratedTicket] = useState<Ticket | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleGenerateTicket = (buttonId: string) => {
    startTransition(async () => {
      const result = await generateTicket(buttonId);
      if (result.success && result.ticket) {
        setGeneratedTicket(result.ticket);
        setIsModalOpen(true);
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Não foi possível gerar a senha.',
          variant: 'destructive',
        });
      }
    });
  };
  
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // Give time for the modal to animate out before clearing the ticket
    setTimeout(() => {
        setGeneratedTicket(null);
    }, 300);
  }, []);

  // Effect to trigger print when modal opens with a ticket
  useEffect(() => {
    if (isModalOpen && generatedTicket) {
      // Use a timeout to allow the DOM to update before printing
      const timer = setTimeout(() => {
        try {
          window.print();
        } catch (e) {
          console.error("Print failed:", e);
           toast({
            title: 'Impressão Falhou',
            description: 'Não foi possível acionar a impressão. Verifique as permissões do navegador.',
            variant: 'destructive',
          });
        }
      }, 100); 
      return () => clearTimeout(timer);
    }
  }, [isModalOpen, generatedTicket, toast]);

  // Effect to handle closing the modal after printing (or cancellation)
  useEffect(() => {
    if (!isModalOpen) {
        return;
    }

    const handleAfterPrint = () => {
        closeModal();
    };

    window.addEventListener('afterprint', handleAfterPrint);
    
    // Fallback in case the user cancels the print dialog or the event doesn't fire
    const fallbackTimeout = setTimeout(() => {
      if(isModalOpen) {
          closeModal();
      }
    }, 5000); // Close modal after 5 seconds if it's still open

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      clearTimeout(fallbackTimeout);
    };
  }, [isModalOpen, closeModal]);


  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 h-full">
        {buttons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => handleGenerateTicket(btn.id)}
            disabled={isPending}
            className="flex flex-col items-center justify-center rounded-xl shadow-lg transition-transform duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-accent h-full text-balance"
            style={{
              backgroundColor: btn.color,
              color: btn.textColor,
            }}
          >
            {isPending ? (
              <Loader2 className="h-16 w-16 animate-spin" />
            ) : (
              <span className="text-3xl sm:text-4xl lg:text-5xl font-bold font-headline p-6 text-center">{btn.name}</span>
            )}
          </button>
        ))}
      </div>
      
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] text-center p-8" onPointerDownOutside={(e) => { e.preventDefault(); closeModal(); }} onEscapeKeyDown={closeModal}>
          <DialogHeader>
            <div className="mx-auto bg-primary/10 rounded-full p-4 w-fit mb-4">
              <TicketIcon className="h-12 w-12 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-headline">Sua Senha foi Gerada!</DialogTitle>
            <DialogDescription>
              Aguarde ser chamado. Sua senha está sendo impressa.
            </DialogDescription>
          </DialogHeader>
          <div className="my-6">
            <p className="text-7xl font-bold text-accent font-mono tracking-wider">{generatedTicket?.ticketNumber}</p>
            <p className="text-muted-foreground text-sm mt-2">
              {generatedTicket && new Date(generatedTicket.timestamp).toLocaleString('pt-BR')}
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={closeModal} className="w-full">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* This area is only visible for printing */}
      <div className="printable-area">
        <PrintableTicketContent ticket={generatedTicket} />
      </div>
    </>
  );
}
