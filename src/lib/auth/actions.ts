'use server';

import { authenticate, revokeSession, AuthError, validateSession } from '@/lib/db/auth-service';
import { headers } from 'next/headers';
import { setSessionCookie, clearSessionCookie, getSessionToken } from './session';
import type { AuthUser } from '@/lib/db/auth-service';

// Authentication server actions (Fase 2C). Passwords never appear in logs;
// cookies are HttpOnly/SameSite=Lax/Secure (see session.ts).

async function requestContext() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  return {
    ip: forwardedFor ? forwardedFor.split(',')[0].trim() : undefined,
    userAgent: headerStore.get('user-agent') ?? undefined,
  };
}

export async function signIn(email: string, password: string) {
  try {
    const context = await requestContext();
    const result = await authenticate(email, password, context);
    if (!result) {
      // Resposta genérica: não revela se o usuário existe ou se está bloqueado.
      return { success: false, error: 'Email ou senha incorretos.' };
    }
    await setSessionCookie(result.sessionToken);
    return { success: true };
  } catch (error) {
    console.error('Falha na autenticação:', error instanceof AuthError ? error.code : error);
    return { success: false, error: 'Erro interno do servidor.' };
  }
}

export async function signOut() {
  try {
    const token = await getSessionToken();
    if (token) {
      revokeSession(token);
    }
    await clearSessionCookie();
    return { success: true };
  } catch (error) {
    console.error('Falha ao encerrar sessão:', error);
    return { success: false, error: 'Erro interno do servidor.' };
  }
}

export async function getSessionUser(): Promise<AuthUser | null> {
  try {
    const token = await getSessionToken();
    if (!token) return null;
    return validateSession(token);
  } catch {
    return null;
  }
}
