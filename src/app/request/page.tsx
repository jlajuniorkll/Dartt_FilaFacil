import { getSettings } from '@/lib/data';
import RequestClient from './RequestClient';

export default async function RequestPage() {
  const settings = await getSettings();

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="p-4 text-center bg-card shadow-md">
        <h1 className="text-3xl font-bold font-headline text-primary">Retire sua Senha</h1>
        <p className="text-muted-foreground">Toque em uma das opções abaixo para gerar sua senha de atendimento.</p>
      </header>
      <main className="flex-grow">
        <RequestClient buttons={settings.buttons} />
      </main>
      <footer className="p-4 text-center text-sm text-muted-foreground bg-card">
        Fila Fácil &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
