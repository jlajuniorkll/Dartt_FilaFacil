'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmail } from '@/lib/auth/actions';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(1, 'Senha é obrigatória.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    startTransition(async () => {
      const result = await signInWithEmail(data);
      if (result.success) {
        // Force a full page reload to ensure all states are updated correctly.
        // This is the most robust way to handle post-login redirection.
        window.location.href = '/';
      } else {
        let errorMessage = 'Ocorreu um erro ao tentar fazer login.';
        if (result.error) {
            // Check for common Firebase auth errors for invalid credentials
            const invalidCredentialCodes = [
              'auth/invalid-credential', 
              'auth/wrong-password', 
              'auth/user-not-found',
              'auth/invalid-email',
            ];
            
            if (invalidCredentialCodes.some(code => result.error?.includes(code))) {
                errorMessage = 'Email ou senha incorretos.';
            } else {
                // Log the specific error for debugging but show a generic message
                console.error("Firebase Auth Error:", result.error);
            }
        }
        toast({
          title: 'Erro de Login',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="seu@email.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="********" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : 'Entrar'}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}