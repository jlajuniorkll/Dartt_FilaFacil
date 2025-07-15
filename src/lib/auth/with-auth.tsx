'use client';

import { ComponentType, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type UserRole } from './auth-context';
import { Loader2 } from 'lucide-react';

export default function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>,
  allowedRoles?: UserRole[]
) {
  const WithAuthComponent = (props: P) => {
    const { user, role, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (loading) {
        return; // Wait for the auth state to be determined
      }

      if (!user) {
        router.replace('/login');
        return;
      }
      
      if (allowedRoles && role && !allowedRoles.includes(role)) {
        router.replace('/'); // Redirect to home if role is not allowed
      }

    }, [user, role, loading, router]);

    if (loading || !user) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }
    
    if (allowedRoles && role && !allowedRoles.includes(role)) {
       return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <p>Você não tem permissão para acessar esta página.</p>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };

  WithAuthComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithAuthComponent;
}
