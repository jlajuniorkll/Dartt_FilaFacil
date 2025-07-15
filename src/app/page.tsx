
'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

// Esta página agora atua como um roteador central.
// O AuthProvider já mostra um loader em tela cheia enquanto `loading` é true.
export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Só toma a decisão de redirecionar DEPOIS que o carregamento da autenticação terminar.
    if (!loading) {
      if (user) {
        router.replace('/home');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  // Não renderiza nada, pois o AuthProvider já está mostrando um loader global
  // e o redirecionamento será quase instantâneo após o carregamento.
  return null;
}
