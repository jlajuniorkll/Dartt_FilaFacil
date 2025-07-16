
'use client';

import type { ButtonConfig, Ticket } from '@/lib/types';
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

// This is the new printable ticket component, directly inside the client file for simplicity.
function PrintableTicket({ ticket }: { ticket: Ticket | null }) {
  if (!ticket) return null;

  return (
    <div className="p-2 text-black bg-white" style={{ fontFamily: 'monospace', width: '80mm' }}>
      <div className="text-center">
        <h1 className="text-lg font-bold">Fila Fácil</h1>
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


export default function RequestClient({ buttons }: { buttons: ButtonConfig[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [generatedTicket, setGeneratedTicket] = useState<Ticket | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleGenerateTicket = (buttonId: string) => {
    startTransition(async () => {
      const result = await generateTicket(buttonId);
      if (result.success && result.ticket) {
        setGeneratedTicket(result.ticket);
        setIsModalOpen(true); // This will trigger the useEffect for printing
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
    // Delay resetting the ticket to avoid flicker during modal close animation
    setTimeout(() => {
      setGeneratedTicket(null);
    }, 300);
  }, []);
  
  // This effect triggers the print dialog once the modal is open and the ticket is ready
  useEffect(() => {
    if (isModalOpen && generatedTicket) {
      // This timeout is crucial. It waits for the browser's next event loop "tick",
      // giving React enough time to render both the modal and the printable area
      // before the print dialog is opened.
      const timer = setTimeout(() => {
        window.print();
      }, 100); // 100ms is a safe delay
      
      return () => clearTimeout(timer);
    }
  }, [isModalOpen, generatedTicket]);
  
  // This effect handles closing the modal after the print dialog is interacted with.
  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleAfterPrint = () => {
      closeModal();
    };

    window.addEventListener('afterprint', handleAfterPrint);
    
    // Fallback for browsers that might not fire 'afterprint' if the user cancels.
    const fallbackTimeout = setTimeout(() => {
        if(isModalOpen) {
            closeModal();
        }
    }, 5000); // 5 seconds

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      clearTimeout(fallbackTimeout);
    };
  }, [isModalOpen, closeModal]);


  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 h-full not-printable">
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
        <DialogContent className="sm:max-w-[425px] text-center p-8 not-printable" onPointerDownOutside={(e) => { e.preventDefault(); closeModal(); }} onEscapeKeyDown={closeModal}>
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
      
      <div className="printable-area">
        <PrintableTicket ticket={generatedTicket} />
      </div>
    </>
  );
}
