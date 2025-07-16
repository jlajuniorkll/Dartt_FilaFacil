
import * as React from 'react';
import type { Ticket } from '@/lib/types';

interface PrintableTicketProps {
  ticket: Ticket;
  onRendered: () => void;
}

const PrintableTicket = React.forwardRef<HTMLDivElement, PrintableTicketProps>(({ ticket, onRendered }, ref) => {
  const internalRef = React.useRef<HTMLDivElement>(null);

  // This effect will run once the component has been mounted and the ref is attached.
  // It calls the onRendered callback, which will trigger window.print() in the parent.
  React.useEffect(() => {
    if (internalRef.current) {
        // A small timeout can still be beneficial to ensure all styles are applied,
        // especially on slower devices, before the print dialog is shown.
        const timer = setTimeout(() => {
            onRendered();
        }, 50); // 50ms is usually enough
        return () => clearTimeout(timer);
    }
  }, [onRendered]);

  // Combine the forwarded ref with our internal ref if needed
  React.useImperativeHandle(ref, () => internalRef.current as HTMLDivElement);

  if (!ticket) return null;

  return (
    <div ref={internalRef} className="p-2 text-black bg-white" style={{ fontFamily: 'monospace', width: '80mm' }}>
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
});

PrintableTicket.displayName = 'PrintableTicket';

export default PrintableTicket;
