
'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserRole } from './actions';
import { Loader2 } from 'lucide-react';

export type UserRole = 'admin' | 'operator' | null;

export interface AuthContextType {
  user: FirebaseUser | null;
  role: UserRole;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Este componente de loader será exibido em tela cheia.
function FullScreenLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  // `authLoading` controla a verificação inicial do Firebase.
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userRole = await getUserRole(firebaseUser.uid);
        setRole(userRole);
      } else {
        setUser(null);
        setRole(null);
      }
      // A verificação inicial terminou.
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = { user, role, loading: authLoading };

  // Renderiza o loader em tela cheia até que a autenticação inicial seja verificada.
  // Isso previne que qualquer página renderize um estado incorreto e cause loops.
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
