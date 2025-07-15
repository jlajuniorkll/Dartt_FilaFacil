'use client';

import { ComponentType, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type UserRole } from './auth-context';
import { Loader2 } from 'lucide-react';

export default function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>,
  allowedRoles?: Array<'admin' | 'operator'>
) {
  const WithAuthComponent = (props: P) => {
    const { user, role, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !user) {
        router.replace('/login');
      }
    }, [user, loading, router]);

    if (loading || !user) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }

    if (allowedRoles && !allowedRoles.includes(role as 'admin' | 'operator')) {
       return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Acesso Negado</h1>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
            <Button onClick={() => router.push('/')} className="mt-4">Voltar para o Início</Button>
          </div>
        </div>
      );
    }
    
    return <WrappedComponent {...props} />;
  };

  WithAuthComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithAuthComponent;
}
