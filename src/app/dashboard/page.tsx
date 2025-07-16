
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { getDashboardStats } from '@/lib/data';
import type { DashboardStats } from '@/lib/types';
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Ticket, PhoneOutgoing, Clock } from 'lucide-react';

function DashboardPageContent({ initialStats }: { initialStats: DashboardStats }) {

  return (
    <>
      <Header />
      <div className="container mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold font-headline mb-6">Dashboard</h1>
        
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Senhas Emitidas (Hoje)</CardTitle>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{initialStats.totalIssued}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Senhas Chamadas (Hoje)</CardTitle>
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
                    <Bar dataKey="count" name="Total Emitido" />
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
                    <Bar dataKey="count" name="Total Chamado" fill="var(--color-fill)" />
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
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);

  React.useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (role !== 'admin') {
        router.replace('/home');
      }
    }
  }, [user, role, loading, router]);

  React.useEffect(() => {
    if (user && role === 'admin') {
      getDashboardStats().then(setStats);
    }
  }, [user, role]);

  if (loading || !user || role !== 'admin' || !stats) {
    return null; // The AuthProvider shows a global loader
  }

  return <DashboardPageContent initialStats={stats} />;
}
