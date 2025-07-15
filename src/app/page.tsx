
'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

// Esta página agora atua como um roteador.
// O AuthProvider já mostra um loader em tela cheia,
// então não precisamos de um loader aqui.
export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Só redireciona quando o estado de autenticação estiver definido.
    if (!loading) {
      if (user) {
        router.replace('/home');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  // Não renderiza nada, pois o AuthProvider já está mostrando um loader
  // e o redirecionamento será quase instantâneo.
  return null;
}
