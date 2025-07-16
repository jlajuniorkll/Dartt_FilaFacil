
'use client';

import * as React from 'react';
import type { DashboardStats } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Ticket, PhoneOutgoing, Clock, Loader2, Printer } from 'lucide-react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { subDays } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';

// Adicione esta interface para estender as opções do autoTable com uma propriedade cursor
interface AutoTableUserOptions extends UserOptions {
  cursor?: { y: number };
}

export default function DashboardClient({ 
  initialStats, 
  onFilter, 
  loading 
}: { 
  initialStats: DashboardStats; 
  onFilter: (range: DateRange) => void;
  loading: boolean;
}) {
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const handlePrint = () => {
    const doc = new jsPDF();
    const formatDate = (date: Date | undefined) => date ? date.toLocaleDateString('pt-BR') : 'N/A';
    
    // Título Principal do Relatório
    const reportTitle = `Relatório Fila Fácil - Período: ${formatDate(dateRange?.from)} a ${formatDate(dateRange?.to)}`;
    doc.setFontSize(18);
    doc.text(reportTitle, 14, 22);

    // Primeira Tabela: Métricas Gerais
    autoTable(doc, {
      startY: 30,
      head: [['Métrica', 'Valor']],
      body: [
        ['Senhas Emitidas', String(initialStats.totalIssued)],
        ['Senhas Chamadas', String(initialStats.totalCalled)],
        ['Aguardando na Fila (no fim do período)', String(initialStats.waitingCount)],
      ],
      theme: 'grid'
    });

    // Função auxiliar para adicionar tabelas com título
    const addTitledTable = (title: string, options: AutoTableUserOptions) => {
      const lastTable = (doc as any).lastAutoTable;
      const startY = lastTable.finalY + 15; // Adiciona um espaçamento de 15px

      doc.setFontSize(14);
      doc.text(title, 14, startY);

      options.startY = startY + 6; // Posição inicial da tabela abaixo do título
      autoTable(doc, options);
    };

    // Tabela: Distribuição por Tipo
    if (initialStats.ticketsByType.length > 0) {
      addTitledTable('Distribuição de Senhas por Tipo', {
        head: [['Tipo de Senha', 'Quantidade Emitida']],
        body: initialStats.ticketsByType.map(item => [item.name, item.count]),
        theme: 'grid',
      });
    }

    // Tabela: Chamadas por Guichê
    if (initialStats.ticketsByCounter.length > 0) {
      addTitledTable('Senhas Chamadas por Guichê', {
        head: [['Guichê', 'Quantidade Chamada']],
        body: initialStats.ticketsByCounter.map(item => [item.counter, item.count]),
        theme: 'grid',
      });
    }
    
    doc.save(`relatorio_fila_facil_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
      <div className="container mx-auto p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h1 className="text-3xl font-bold font-headline">Dashboard</h1>
            <div className="flex flex-wrap items-center gap-2">
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                <Button onClick={() => dateRange && onFilter(dateRange)} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Filtrar
                </Button>
                <Button variant="outline" onClick={handlePrint} disabled={loading}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir (PDF)
                </Button>
            </div>
        </div>
        
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Senhas Emitidas</CardTitle>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{initialStats.totalIssued}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Senhas Chamadas</CardTitle>
              <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{initialStats.totalCalled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aguardando na Fila</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{initialStats.waitingCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="mt-8 flex flex-col gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Distribuição de Senhas por Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={initialStats.ticketsByType} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                       contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          borderColor: 'hsl(var(--border))',
                       }}
                    />
                    <Legend />
                    <Bar dataKey="count" name="Total Emitido">
                        {initialStats.ticketsByType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

           <Card>
            <CardHeader>
              <CardTitle>Senhas Chamadas por Guichê</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={initialStats.ticketsByCounter} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="counter" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                       contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          borderColor: 'hsl(var(--border))',
                       }}
                    />
                    <Legend />
                    <Bar dataKey="count" name="Total Chamado">
                       {initialStats.ticketsByCounter.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
