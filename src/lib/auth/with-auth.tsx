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

    // After loading, if there's a user, check their role.
    if (allowedRoles && !allowedRoles.includes(role)) {
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
