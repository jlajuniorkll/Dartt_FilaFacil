
import * as React from 'react';
import type { Ticket } from '@/lib/types';

interface PrintableTicketProps {
  ticket: Ticket;
}

const PrintableTicket = React.forwardRef<HTMLDivElement, PrintableTicketProps>(({ ticket }, ref) => {
  if (!ticket) return null;

  return (
    <div ref={ref} className="p-2 text-black bg-white" style={{ fontFamily: 'monospace', width: '80mm' }}>
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
