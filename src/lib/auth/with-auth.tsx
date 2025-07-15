'use client';

import { ComponentType, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type UserRole } from './auth-context';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>,
  allowedRoles?: Array<'admin' | 'operator'>
) {
  const WithAuthComponent = (props: P) => {
    const { user, role, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      // If loading is finished and there's no user, redirect to login.
      if (!loading && !user) {
        router.replace('/login');
      }
    }, [user, loading, router]);

    // While the auth state is loading, show a spinner.
    if (loading) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }
    
    // If there is no user after loading, this will be handled by the useEffect redirect.
    // This check is for the case where the component renders before the redirect happens.
    if (!user) {
       return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }

    // If roles are specified and the user's role is not in the allowed list, show access denied.
    if (allowedRoles && role && !allowedRoles.includes(role)) {
       return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-background p-4 text-center">
            <h1 className="text-2xl font-bold font-headline">Acesso Negado</h1>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
            <Button onClick={() => router.push('/')} className="mt-4">Voltar para o Início</Button>
        </div>
      );
    }
    
    // If all checks pass, render the wrapped component.
    return <WrappedComponent {...props} />;
  };

  WithAuthComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithAuthComponent;
}
