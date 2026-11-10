import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import type { SqliteDatabase } from './connection';
import { getDb } from './connection';
import { initializeDatabase } from './init';
import { nowIso } from './time';

if (typeof window !== 'undefined') {
  throw new Error('src/lib/db/auth-service.ts is server-side only.');
}

// Server-only local authentication service for the FilaFácil SQLite backend.
// Not wired to the UI yet (Fase 2C). Do not import from client components.

export type AuthRole = 'admin' | 'operator';

export interface AuthUser {
  id: string;
  email: string;
  role: AuthRole;
}

export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

export class AuthError extends Error {
  constructor(
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN',
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, absolute expiry
export const SESSION_COOKIE = 'filafacil_session';
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

const ARGON2_OPTIONS = {
  algorithm: 2, // argon2id
  memoryCost: 19456, // 19 MiB (OWASP)
  timeCost: 2,
  parallelism: 1,
} as const;

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_MIN_LENGTH = 12;

const globalForInit = globalThis as unknown as { __filafacilInitFor?: string };

function ready(): void {
  const path = process.env.SQLITE_PATH?.trim() || '';
  if (globalForInit.__filafacilInitFor === path) return;
  initializeDatabase();
  globalForInit.__filafacilInitFor = path;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'A senha deve conter letras e números.';
  }
  return null;
}

async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    return false;
  }
}

type UserRow = {
  id: string;
  email: string;
  role: string;
  password_hash: string | null;
  disabled_at: string | null;
};

function mapUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, role: row.role as AuthRole };
}

export function findUserByEmail(email: string): AuthUser | null {
  ready();
  const row = getDb()
    .prepare('SELECT id, email, role, disabled_at FROM users WHERE email = ? COLLATE NOCASE')
    .get(normalizeEmail(email)) as UserRow | undefined;
  if (!row) return null;
  return mapUser(row);
}

function findUserRowByEmail(db: SqliteDatabase, email: string): UserRow | undefined {
  return db
    .prepare('SELECT id, email, role, password_hash, disabled_at FROM users WHERE email = ? COLLATE NOCASE')
    .get(normalizeEmail(email)) as UserRow | undefined;
}

function countAdmins(db: SqliteDatabase): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND disabled_at IS NULL")
    .get() as { c: number };
  return row.c;
}

function countUsers(db: SqliteDatabase): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c;
}

function recordLoginAttempt(
  db: SqliteDatabase,
  email: string,
  success: boolean,
  ip: string | undefined,
  at: string
): void {
  db.prepare('INSERT INTO login_attempts (email, attempted_at, success, ip) VALUES (?, ?, ?, ?)').run(
    normalizeEmail(email),
    at,
    success ? 1 : 0,
    ip ?? null
  );
  db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(
    new Date(Date.now() - ATTEMPT_RETENTION_MS).toISOString()
  );
}

function isLockedOut(db: SqliteDatabase, email: string, now: Date): boolean {
  const since = new Date(now.getTime() - LOCKOUT_WINDOW_MS).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM login_attempts
       WHERE email = ? COLLATE NOCASE AND success = 0 AND attempted_at >= ?`
    )
    .get(normalizeEmail(email), since) as { c: number };
  return row.c >= LOCKOUT_THRESHOLD;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: AuthRole;
}

export type CreateUserActor = AuthUser | null;

export interface CreateUserOptions {
  /** Allows creating the very first admin when no users exist at all (bootstrap). */
  allowBootstrap?: boolean;
}

export async function createUser(
  actor: CreateUserActor,
  input: CreateUserInput,
  options: CreateUserOptions = {}
): Promise<AuthUser> {
  ready();
  const db = getDb();

  const strengthError = validatePasswordStrength(input.password);
  if (strengthError) {
    throw new Error(strengthError);
  }

  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email inválido.');
  }
  if (input.role !== 'admin' && input.role !== 'operator') {
    throw new Error('Perfil inválido.');
  }

  const isBootstrap = options.allowBootstrap === true && countUsers(db) === 0;

  if (!isBootstrap) {
    if (!actor) {
      throw new AuthError('UNAUTHENTICATED', 'Autenticação necessária para criar usuários.');
    }
    // Only admins manage users; nobody can escalate privileges by self-provisioning.
    if (actor.role !== 'admin') {
      throw new AuthError('FORBIDDEN', 'Apenas administradores podem criar usuários.');
    }
  }

  if (findUserRowByEmail(db, email)) {
    throw new Error('Email já cadastrado.');
  }

  const passwordHash = await hashPassword(input.password);
  const ts = nowIso();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO users (id, email, role, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, email, input.role, passwordHash, ts, ts);

  return { id, email, role: input.role };
}

/**
 * Creates the very first administrator. Only allowed when the users table is
 * completely empty (fresh install). Used exclusively by manual operators via
 * scripts/create-admin.ts. Never call this at startup or from actions.
 */
export async function bootstrapFirstAdmin(input: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  ready();
  const db = getDb();
  if (countUsers(db) > 0) {
    throw new Error('Bootstrap recusado: já existem usuários cadastrados.');
  }
  return createUser(null, { ...input, role: 'admin' }, { allowBootstrap: true });
}

export interface AuthenticateSuccess {
  user: AuthUser;
  sessionToken: string;
  expiresAt: string;
}

export async function authenticate(
  email: string,
  password: string,
  context: SessionContext = {},
  referenceDate?: Date
): Promise<AuthenticateSuccess | null> {
  ready();
  const db = getDb();
  const normalized = normalizeEmail(email);
  const now = referenceDate ?? new Date();
  const attemptAt = now.toISOString();

  if (isLockedOut(db, normalized, now)) {
    // Do not leak lockout details beyond a generic message.
    return null;
  }

  const row = findUserRowByEmail(db, normalized);
  const passwordOk = row?.password_hash ? await verifyPassword(row.password_hash, password) : false;
  const userOk = row && !row.disabled_at && passwordOk;

  recordLoginAttempt(db, normalized, Boolean(userOk), context.ip, attemptAt);

  if (!userOk || !row) {
    return null;
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(attemptAt, row.id);
  const session = createSession(row.id, context, referenceDate);
  return { user: mapUser(row), ...session };
}

export function createSession(
  userId: string,
  context: SessionContext = {},
  referenceDate?: Date
): { sessionToken: string; expiresAt: string } {
  ready();
  const db = getDb();
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const now = referenceDate ?? new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, sha256(token), userId, now.toISOString(), expires.toISOString(), context.ip ?? null, context.userAgent ?? null);

  return { sessionToken: token, expiresAt: expires.toISOString() };
}

export function validateSession(token: string): AuthUser | null {
  ready();
  if (!token || typeof token !== 'string') return null;
  const db = getDb();
  const tokenHash = sha256(token);
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.disabled_at, s.expires_at, s.revoked_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | (UserRow & { expires_at: string; revoked_at: string | null })
    | undefined;

  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.disabled_at) return null;

  const hashA = Buffer.from(tokenHash, 'utf8');
  // Defense in depth: compare stored and recomputed hash in constant time.
  const hashB = Buffer.from(sha256(token), 'utf8');
  if (hashA.length !== hashB.length || !timingSafeEqual(hashA, hashB)) return null;

  db.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').run(nowIso(), tokenHash);
  return mapUser(row);
}

export function revokeSession(token: string): void {
  ready();
  if (!token || typeof token !== 'string') return;
  getDb().prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run(nowIso(), sha256(token));
}

export function revokeAllSessionsForUser(userId: string): void {
  ready();
  getDb()
    .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(nowIso(), userId);
}

export function purgeExpiredSessions(): number {
  ready();
  const result = getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
  return result.changes;
}

// --- Authorization helpers (for server actions and routes, Fase 2C) ---

export function requireUser(token: string | null | undefined): AuthUser {
  const user = token ? validateSession(token) : null;
  if (!user) {
    throw new AuthError('UNAUTHENTICATED', 'Autenticação necessária.');
  }
  return user;
}

export function requireAdmin(token: string | null | undefined): AuthUser {
  const user = requireUser(token);
  if (user.role !== 'admin') {
    throw new AuthError('FORBIDDEN', 'Ação restrita a administradores.');
  }
  return user;
}

export function requireOperatorOrAdmin(token: string | null | undefined): AuthUser {
  const user = requireUser(token);
  if (user.role !== 'admin' && user.role !== 'operator') {
    throw new AuthError('FORBIDDEN', 'Ação restrita a operadores e administradores.');
  }
  return user;
}

export function hasRole(user: AuthUser | null, roles: AuthRole[]): boolean {
  return Boolean(user && roles.includes(user.role));
}

// --- User administration ---

function assertAdmin(actor: AuthUser): void {
  if (!actor || actor.role !== 'admin') {
    throw new AuthError('FORBIDDEN', 'Ação restrita a administradores.');
  }
}

export function deactivateUser(actor: AuthUser, targetUserId: string): void {
  ready();
  const db = getDb();
  assertAdmin(actor);
  const target = db
    .prepare('SELECT id, role, disabled_at FROM users WHERE id = ?')
    .get(targetUserId) as { id: string; role: string; disabled_at: string | null } | undefined;
  if (!target) {
    throw new Error('Usuário não encontrado.');
  }
  if (target.disabled_at) return; // já desativado: idempotente
  if (target.id === actor.id) {
    throw new Error('Um administrador não pode desativar a si mesmo.');
  }
  if (target.role === 'admin' && countAdmins(db) <= 1) {
    throw new Error('Não é possível desativar o último administrador ativo.');
  }
  const ts = nowIso();
  db.prepare('UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, targetUserId);
  revokeAllSessionsForUser(targetUserId);
}

/**
 * Sets a new password for an existing user and revokes all their sessions.
 * Intended for manual, operator-run scripts (migration from Firebase, admin
 * recovery). Does NOT verify the old password — protect at the OS level.
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  ready();
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) {
    throw new Error(strengthError);
  }
  const db = getDb();
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) {
    throw new Error('Usuário não encontrado.');
  }
  const passwordHash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    nowIso(),
    userId
  );
  revokeAllSessionsForUser(userId);
}

export function activateUser(actor: AuthUser, targetUserId: string): void {
  ready();
  const db = getDb();
  assertAdmin(actor);
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!target) {
    throw new Error('Usuário não encontrado.');
  }
  db.prepare('UPDATE users SET disabled_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), targetUserId);
}

