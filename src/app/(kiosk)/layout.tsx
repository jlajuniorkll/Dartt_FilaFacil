import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PROCON - Kiosk',
  description: 'Sistema de Gerenciamento de Filas',
};

export default function KioskLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
