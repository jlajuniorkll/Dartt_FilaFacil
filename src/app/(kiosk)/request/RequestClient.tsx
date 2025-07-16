
'use client';

import type { ButtonConfig, Ticket } from '@/lib/types';
import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
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
import PrintableTicket from '@/components/PrintableTicket';

export default function RequestClient({ buttons }: { buttons: ButtonConfig[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [generatedTicket, setGeneratedTicket] = useState<Ticket | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const printableTicketRef = useRef(null);

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
    // Delay resetting the ticket to avoid flicker during modal close animation
    setTimeout(() => {
        setGeneratedTicket(null);
    }, 300);
  }, []);

  useEffect(() => {
    if (!isModalOpen || !generatedTicket) {
      return;
    }

    const handlePrint = () => {
      // Use a timeout to ensure the printable content is rendered before printing
      const printTimeout = setTimeout(() => {
        window.print();
      }, 500); // A 500ms delay is generally safe for rendering
      return printTimeout;
    };

    const printTimeoutId = handlePrint();
    
    // This event listener closes the modal after the print dialog is closed (either by printing or canceling)
    const handleAfterPrint = () => {
      closeModal();
    };

    window.addEventListener('afterprint', handleAfterPrint);

    // Fallback: If the user just closes the print dialog without printing,
    // the 'afterprint' event might not fire consistently across browsers.
    // We'll set a timeout to close the modal anyway.
    const fallbackTimeoutId = setTimeout(() => {
        if (isModalOpen) {
            closeModal();
        }
    }, 5000); // Close after 5 seconds if nothing happens

    // Cleanup function
    return () => {
      clearTimeout(printTimeoutId);
      clearTimeout(fallbackTimeoutId);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [isModalOpen, generatedTicket, closeModal]);


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
        <DialogContent className="sm:max-w-[425px] text-center p-8 not-printable" onPointerDownOutside={closeModal} onEscapeKeyDown={closeModal}>
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
      
      {generatedTicket && (
        <div className="printable-area">
          <PrintableTicket ticket={generatedTicket} ref={printableTicketRef} />
        </div>
      )}
    </>
  );
}
