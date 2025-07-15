import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fila Fácil - Kiosk',
  description: 'Sistema de Gerenciamento de Filas',
};

export default function KioskLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
