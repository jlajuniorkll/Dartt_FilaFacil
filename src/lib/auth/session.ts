import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/db/auth-service';

// Server-side session cookie helpers. Not wired into the app yet (Fase 2C).
// Cookie: HttpOnly, SameSite=Lax, Secure in production (override via
// FILAFACIL_COOKIE_SECURE=true|false), Path=/, session-scoped lifetime.

export function isCookieSecure(): boolean {
  const override = process.env.FILAFACIL_COOKIE_SECURE;
  if (override !== undefined) return override.toLowerCase() === 'true';
  return process.env.NODE_ENV === 'production';
}

export async function setSessionCookie(token: string, maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(),
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(),
    path: '/',
    maxAge: 0,
  });
}

export async function getSessionToken(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(SESSION_COOKIE)?.value ?? null;
  } catch {
    // No request scope (e.g. scripts/tests): treat as unauthenticated.
    return null;
  }
}
