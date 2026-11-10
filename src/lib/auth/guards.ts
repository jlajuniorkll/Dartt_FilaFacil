import { AuthError, type AuthRole, type AuthUser } from '@/lib/db/auth-service';

// Pure authorization predicates shared by server actions (data.ts).
// They receive the already-resolved AuthUser (or null) and never trust
// client-supplied roles — the role comes only from the SQLite session.

export function assertRole(user: AuthUser | null, allowed: AuthRole[]): AuthUser {
  if (!user) {
    throw new AuthError('UNAUTHENTICATED', 'Autenticação necessária.');
  }
  if (!allowed.includes(user.role)) {
    throw new AuthError('FORBIDDEN', 'Permissão insuficiente para esta operação.');
  }
  return user;
}

export function assertOperatorOrAdmin(user: AuthUser | null): AuthUser {
  return assertRole(user, ['admin', 'operator']);
}

export function assertAdmin(user: AuthUser | null): AuthUser {
  return assertRole(user, ['admin']);
}
