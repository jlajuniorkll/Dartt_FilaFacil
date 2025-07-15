
'use client'

import { useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings, Ticket, Monitor, UserCheck } from 'lucide-react';
import Header from '@/components/Header';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';

const allFeatures = [
  {
    title: 'Configurações',
    description: 'Defina os tipos de senha, vídeos e prioridades.',
    href: '/settings',
    icon: <Settings className="h-10 w-10 text-primary" />,
    roles: ['admin'],
  },
  {
    title: 'Solicitar Senha',
    description: 'Tela para clientes retirarem uma nova senha.',
    href: '/request',
    icon: <Ticket className="h-10 w-10 text-primary" />,
    roles: ['public'],
  },
  {
    title: 'Chamar Senha',
    description: 'Tela para operadores chamarem a próxima senha.',
    href: '/call',
    icon: <UserCheck className="h-10 w-10 text-primary" />,
    roles: ['admin', 'operator'],
  },
  {
    title: 'Painel de Exibição',
    description: 'Painel público que exibe as senhas chamadas.',
    href: '/display',
    icon: <Monitor className="h-10 w-10 text-primary" />,
    roles: ['public', 'admin', 'operator'],
  },
];

export default function HomePage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // Não renderiza nada enquanto verifica o usuário para evitar piscar a tela
  if (loading || !user) {
    return null; 
  }
  
  const features = allFeatures.filter(feature => {
      if (feature.roles.includes('public')) return true;
      if (user && role) {
          return feature.roles.includes(role);
      }
      return false;
  });

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold font-headline tracking-tight text-gray-800 sm:text-5xl">
            Bem-vindo ao Fila Fácil
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Sua solução completa para gerenciamento de filas.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Link href={feature.href} key={feature.title}>
              <Card className="h-full transform transition-all duration-300 hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <CardHeader className="flex flex-col items-center justify-center text-center p-6">
                  <div className="mb-4 rounded-full bg-primary/10 p-4">
                    {feature.icon}
                  </div>
                  <CardTitle className="font-headline text-xl">{feature.title}</CardTitle>
                  <CardDescription className="mt-2">{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
