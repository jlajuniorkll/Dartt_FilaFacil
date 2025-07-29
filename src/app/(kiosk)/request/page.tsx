
import { getSettings } from '@/lib/data';
import RequestClient from './RequestClient';

export const dynamic = 'force-dynamic';

export default async function RequestPage() {
  const settings = await getSettings();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <header className="p-4 text-center bg-card shadow-md flex-shrink-0">
        <h1 className="text-3xl font-bold font-headline text-primary">Retire sua Senha</h1>
        <p className="text-muted-foreground">Toque em uma das opções abaixo para gerar sua senha de atendimento.</p>
      </header>
      <main className="flex-grow h-full overflow-y-auto">
        <RequestClient buttons={settings.buttons} />
      </main>
      <footer className="p-4 text-center text-sm text-muted-foreground bg-card flex-shrink-0">
        PROCON &copy; {new Date().getFullYear()} - v1.0.2
      </footer>
    </div>
  );
}
