
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { getDashboardStats } from '@/lib/data';
import type { DashboardStats } from '@/lib/types';
import Header from '@/components/Header';
import { Loader2 } from 'lucide-react';
import { subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import DashboardClient from './dashboard-client';


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
        <Header />
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (dataLoading && !stats) {
     return (
        <>
            <Header />
            <div className="flex h-[calc(100vh-4rem)] w-screen items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        </>
    );
  }

  if (error) {
    return (
    <>
        <Header />
        <div className="flex h-[calc(100vh-4rem)] w-screen items-center justify-center bg-background">
            <p className="text-destructive">{error}</p>
        </div>
    </>
    );
  }

  if (!stats) {
    return (
        <>
            <Header />
            <div className="flex h-[calc(100vh-4rem)] w-screen items-center justify-center bg-background">
                <p>Nenhuma estatística encontrada.</p>
            </div>
        </>
    )
  }

  return (
    <>
        <Header />
        <DashboardClient initialStats={stats} onFilter={handleFilter} loading={dataLoading} />
    </>
  );
}
