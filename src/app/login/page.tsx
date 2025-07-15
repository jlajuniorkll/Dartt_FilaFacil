import LoginForm from './login-form';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-headline text-2xl">Acessar Painel</CardTitle>
          <CardDescription>Use suas credenciais para entrar no sistema.</CardDescription>
        </CardHeader>
        <LoginForm />
      </Card>
    </div>
  );
}
