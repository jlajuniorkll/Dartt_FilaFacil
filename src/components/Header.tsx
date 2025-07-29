
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { signOut } from '@/lib/auth/actions';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';

export default function Header() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <Link href="/home" className="flex items-center space-x-2 mr-auto">
          <Image src="/logo.png" alt="PROCON Logo" width={100} height={25} priority />
        </Link>
        {!loading && user && (
           <Button variant="ghost" size="sm" onClick={handleLogout}>
             <LogOut className="mr-2 h-4 w-4" />
             Sair
           </Button>
        )}
      </div>
    </header>
  );
}
