import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/db/connection.ts is server-side only and must not be imported by client components.'
  );
}

export type SqliteDatabase = Database.Database;

export const DEFAULT_SQLITE_PATH = path.join(process.cwd(), 'data', 'filafacil.db');

const globalForDb = globalThis as unknown as { __filafacilDb?: SqliteDatabase };

export function getSqlitePath(): string {
  const fromEnv = process.env.SQLITE_PATH?.trim();
  return fromEnv ? path.resolve(fromEnv) : DEFAULT_SQLITE_PATH;
}

export function getDb(): SqliteDatabase {
  const cached = globalForDb.__filafacilDb;
  if (cached) return cached;

  const dbPath = getSqlitePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  globalForDb.__filafacilDb = db;
  return db;
}

export function closeDb(): void {
  const cached = globalForDb.__filafacilDb;
  if (cached) {
    cached.close();
    delete globalForDb.__filafacilDb;
  }
}
