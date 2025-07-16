
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { getDashboardStats } from '@/lib/data';
import type { DashboardStats } from '@/lib/types';
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Ticket, PhoneOutgoing, Clock, Loader2, Printer } from 'lucide-react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { subDays } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function DashboardPageContent({ 
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
    const reportTitle = `Relatório Fila Fácil - Período: ${formatDate(dateRange?.from)} a ${formatDate(dateRange?.to)}`;
    
    doc.setFontSize(18);
    doc.text(reportTitle, 14, 22);

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

    if (initialStats.ticketsByType.length > 0) {
      autoTable(doc, {
        head: [['Tipo de Senha', 'Quantidade Emitida']],
        body: initialStats.ticketsByType.map(item => [item.name, item.count]),
        theme: 'grid',
        didDrawPage: (data) => {
            doc.setFontSize(14);
            doc.text('Distribuição de Senhas por Tipo', 14, data.cursor.y - 10);
        }
      });
    }

    if (initialStats.ticketsByCounter.length > 0) {
      autoTable(doc, {
        head: [['Guichê', 'Quantidade Chamada']],
        body: initialStats.ticketsByCounter.map(item => [item.counter, item.count]),
        theme: 'grid',
         didDrawPage: (data) => {
            doc.setFontSize(14);
            doc.text('Senhas Chamadas por Guichê', 14, data.cursor.y - 10);
        }
      });
    }
    
    doc.save(`relatorio_fila_facil_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <>
      <Header />
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
                    <Bar dataKey="count" name="Total Emitido" fill="hsl(var(--primary))">
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
                    <Bar dataKey="count" name="Total Chamado" fill="hsl(var(--primary))">
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
    </>
  );
}


export default function DashboardPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [dataLoading, setDataLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchStats = React.useCallback(async (dateRange?: DateRange) => {
    setDataLoading(true);
    setError(null);
    try {
      const statsData = await getDashboardStats(dateRange);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
      setError('Não foi possível carregar as estatísticas.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/login');
      } else if (role !== 'admin') {
        router.replace('/home');
      } else {
         // Initial fetch for the default date range
        fetchStats({ from: subDays(new Date(), 7), to: new Date() });
      }
    }
  }, [user, role, authLoading, router, fetchStats]);

  const handleFilter = (range: DateRange) => {
    fetchStats(range);
  };
  
  if (authLoading || !user || role !== 'admin') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (dataLoading && !stats) {
     return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
        <p>Nenhuma estatística encontrada.</p>
      </div>
    )
  }

  return <DashboardPageContent initialStats={stats} onFilter={handleFilter} loading={dataLoading} />;
}
