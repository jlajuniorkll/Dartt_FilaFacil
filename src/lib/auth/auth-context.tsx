'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getSessionUser } from './actions';
import type { AuthUser } from '@/lib/db/auth-service';
import { Loader2 } from 'lucide-react';

export type UserRole = 'admin' | 'operator' | null;

export interface AuthContextType {
  user: AuthUser | null;
  role: UserRole;
  loading: boolean;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshUser = async (): Promise<AuthUser | null> => {
    try {
      const sessionUser = await getSessionUser();
      setUser(sessionUser);
      setRole(sessionUser?.role ?? null);
      return sessionUser;
    } catch {
      setUser(null);
      setRole(null);
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    getSessionUser()
      .then((sessionUser) => {
        if (!active) return;
        setUser(sessionUser);
        setRole(sessionUser?.role ?? null);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setRole(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = { user, role, loading: authLoading, refreshUser };

  return (
    <AuthContext.Provider value={value}>
      {authLoading ? <FullScreenLoader /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
