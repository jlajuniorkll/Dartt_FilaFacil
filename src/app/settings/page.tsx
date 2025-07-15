import { getSettings } from '@/lib/data';
import SettingsClient from './SettingsClient';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Configurações do Sistema</CardTitle>
          <CardDescription>
            Personalize os botões de senha, vídeos e outras opções. As alterações são salvas automaticamente.
          </CardDescription>
        </CardHeader>
        <SettingsClient initialSettings={settings} />
      </Card>
    </div>
  );
}
