
'use client';

import type { Ticket } from '@/lib/types';
import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
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
import ReactDOMServer from 'react-dom/server';

function PrintableTicketContent({ ticket }: { ticket: Ticket | null }) {
  if (!ticket) return null;

  // This component renders clean HTML without inline styles.
  // All styling is applied in the iframe's <style> tag.
  return (
    <div className="ticket">
      <h1>PROCON</h1>
      <p className="divider">--------------------------------</p>
      <p className="label">Sua Senha:</p>
      <p className="number">{ticket.ticketNumber}</p>
      <p className="divider">--------------------------------</p>
      <p className="timestamp">
        Emitido em: {new Date(ticket.timestamp).toLocaleDateString('pt-BR')} às {new Date(ticket.timestamp).toLocaleTimeString('pt-BR')}
      </p>
      <p className="footer-text">Aguarde sua chamada no painel.</p>
    </div>
  );
}


export default function RequestClient({ buttons }: { buttons: any[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [generatedTicket, setGeneratedTicket] = useState<Ticket | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const printIframeRef = useRef<HTMLIFrameElement>(null);

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

  const triggerPrint = useCallback((ticket: Ticket) => {
    const ticketHtml = ReactDOMServer.renderToString(
      <PrintableTicketContent ticket={ticket} />
    );

    const iframe = printIframeRef.current;
    if (!iframe) return;

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;
    
    iframeDoc.open();
    iframeDoc.write(`
      <html>
        <head>
          <title>Printing Ticket</title>
          <style>
            @page { 
              size: 60mm auto;
              margin: 0mm;
            }
            body { 
              margin: 0; 
              padding: 0;
              color: #000;
              font-family: monospace;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .ticket {
                width: 60mm;
                box-sizing: border-box;
                padding: 2mm;
                text-align: center;
            }
            .ticket h1 {
                font-size: 1.1rem;
                font-weight: bold;
                margin: 4px 0;
            }
            .ticket .divider {
                font-size: 0.75rem;
                margin: 4px 0;
            }
            .ticket .label {
                font-size: 1rem;
                margin: 8px 0;
            }
            .ticket .number {
                font-size: 2.5rem;
                font-weight: bold;
                letter-spacing: 0.1em;
                margin: 8px 0;
            }
            .ticket .timestamp {
                 font-size: 0.75rem;
                 margin: 4px 0;
            }
            .ticket .footer-text {
                font-size: 1rem;
                font-weight: bold;
                margin: 8px 0 4px 0;
            }
          </style>
        </head>
        <body>
          ${ticketHtml}
        </body>
      </html>
    `);
    iframeDoc.close();
    
    const tryPrint = () => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            closeModal();
        } catch(e) {
            console.error("Print failed:", e);
            toast({
              title: 'Impressão Falhou',
              description: 'Não foi possível acionar a impressão. Verifique as configurações do navegador.',
              variant: 'destructive',
            });
            closeModal();
        }
    };
    
    setTimeout(tryPrint, 150);

  }, [closeModal, toast]);

  useEffect(() => {
    if (isModalOpen && generatedTicket) {
      triggerPrint(generatedTicket);
    }
  }, [isModalOpen, generatedTicket, triggerPrint]);


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
      
      <iframe
        ref={printIframeRef}
        style={{
          position: 'absolute',
          width: '0',
          height: '0',
          border: '0',
          top: '-9999px',
          left: '-9999px',
        }}
        title="Print"
      />
    </>
  );
}
