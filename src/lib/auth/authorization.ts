import {
  validateSession,
  requireUser as requireUserService,
  requireAdmin as requireAdminService,
  requireOperatorOrAdmin as requireOperatorOrAdminService,
  type AuthUser,
} from '@/lib/db/auth-service';
import { getSessionToken } from './session';

// Server-side authorization helpers for server actions and route handlers.
// Wired into data.ts (Fase 2C). The Firebase-based flow in
// src/lib/auth/actions.ts has been replaced by the local SQLite session.

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  return token ? validateSession(token) : null;
}

export async function requireAuthenticated(): Promise<AuthUser> {
  return requireUserService(await getSessionToken());
}

export async function requireAdmin(): Promise<AuthUser> {
  return requireAdminService(await getSessionToken());
}

export async function requireOperator(): Promise<AuthUser> {
  return requireOperatorOrAdminService(await getSessionToken());
}

// Public actions do not call these helpers. The current public surface:
// - generateTicket (kiosk emission, /request)
// - getQueueStatus (display panel, /display)
// - getSettings read via server components (/request, /display)
