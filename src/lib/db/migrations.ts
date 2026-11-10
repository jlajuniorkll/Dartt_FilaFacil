import type { SqliteDatabase } from './connection';
import { nowIso } from './time';

interface Migration {
  version: number;
  name: string;
  withoutForeignKeys?: boolean;
  up: (db: SqliteDatabase) => void;
}

const INITIAL_SCHEMA = `
CREATE TABLE profiles (
  id TEXT PRIMARY KEY CHECK (id IN ('admin', 'operator')),
  name TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL REFERENCES profiles (id),
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  priority_enabled INTEGER NOT NULL DEFAULT 1 CHECK (priority_enabled IN (0, 1)),
  counter_configuration TEXT NOT NULL DEFAULT 'none',
  total_counters INTEGER NOT NULL DEFAULT 5 CHECK (total_counters >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE youtube_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settings_id INTEGER NOT NULL DEFAULT 1 REFERENCES settings (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  url TEXT NOT NULL,
  UNIQUE (settings_id, position)
);

CREATE TABLE ticket_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  frequency INTEGER NOT NULL DEFAULT 1 CHECK (frequency >= 1),
  automatic_numbering INTEGER NOT NULL DEFAULT 1 CHECK (automatic_numbering IN (0, 1)),
  start_number INTEGER CHECK (start_number IS NULL OR start_number >= 0),
  color TEXT NOT NULL DEFAULT '#5DADE2',
  text_color TEXT NOT NULL DEFAULT '#FFFFFF',
  associated_counters TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  ticket_number TEXT NOT NULL,
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id),
  prefix TEXT NOT NULL,
  display_number INTEGER NOT NULL CHECK (display_number >= 1),
  issued_at TEXT NOT NULL,
  called INTEGER NOT NULL DEFAULT 0 CHECK (called IN (0, 1)),
  called_at TEXT,
  counter INTEGER,
  UNIQUE (business_date, ticket_type_id, display_number),
  CHECK ((called = 0 AND called_at IS NULL) OR called = 1)
);

CREATE TABLE daily_sequences (
  business_date TEXT NOT NULL,
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (business_date, ticket_type_id)
);

CREATE TABLE priority_call_counters (
  business_date TEXT NOT NULL,
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  PRIMARY KEY (business_date, ticket_type_id)
);

CREATE TABLE call_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_date TEXT NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets (id),
  called_at TEXT NOT NULL,
  counter INTEGER,
  is_repeat INTEGER NOT NULL DEFAULT 0 CHECK (is_repeat IN (0, 1))
);

CREATE INDEX idx_tickets_business_date_called_issued ON tickets (business_date, called, issued_at);
CREATE INDEX idx_tickets_business_date_type ON tickets (business_date, ticket_type_id);
CREATE INDEX idx_tickets_called_at ON tickets (called_at);
CREATE INDEX idx_call_history_business_date_id ON call_history (business_date, id DESC);
CREATE INDEX idx_call_history_ticket_id ON call_history (ticket_id);
`;

const TICKET_TYPE_ACTIVE = `
ALTER TABLE ticket_types ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
CREATE INDEX idx_ticket_types_active_sort_order ON ticket_types (active, sort_order);
`;

// Removes UNIQUE (business_date, ticket_type_id, display_number) from tickets.
// Firebase semantics allow re-issuing the same display number after a sequence
// reset, which the constraint made impossible. Table rebuild is required because
// SQLite cannot drop constraints. call_history references tickets, so this runs
// with foreign_keys disabled (set by the runner) and is verified afterwards.
const TICKETS_DROP_UNIQUE = `
CREATE TABLE tickets_new (
  id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  ticket_number TEXT NOT NULL,
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id),
  prefix TEXT NOT NULL,
  display_number INTEGER NOT NULL CHECK (display_number >= 1),
  issued_at TEXT NOT NULL,
  called INTEGER NOT NULL DEFAULT 0 CHECK (called IN (0, 1)),
  called_at TEXT,
  counter INTEGER,
  CHECK ((called = 0 AND called_at IS NULL) OR called = 1)
);

INSERT INTO tickets_new
  SELECT id, business_date, ticket_number, ticket_type_id, prefix, display_number,
         issued_at, called, called_at, counter
  FROM tickets;

DROP TABLE tickets;
ALTER TABLE tickets_new RENAME TO tickets;

CREATE INDEX idx_tickets_business_date_called_issued ON tickets (business_date, called, issued_at);
CREATE INDEX idx_tickets_business_date_type ON tickets (business_date, ticket_type_id);
CREATE INDEX idx_tickets_called_at ON tickets (called_at);
CREATE INDEX idx_tickets_business_date_type_number ON tickets (business_date, ticket_type_id, display_number);
`;

const AUTH_SCHEMA = `
ALTER TABLE users ADD COLUMN disabled_at TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  attempted_at TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  ip TEXT
);
CREATE INDEX idx_login_attempts_email_time ON login_attempts (email, attempted_at);
`;

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(INITIAL_SCHEMA);
    },
  },
  {
    version: 2,
    name: 'ticket_types_active_and_tickets_unique_removed',
    withoutForeignKeys: true,
    up: (db) => {
      db.exec(TICKET_TYPE_ACTIVE);
      db.exec(TICKETS_DROP_UNIQUE);
    },
  },
  {
    version: 3,
    name: 'auth_sessions_and_login_attempts',
    up: (db) => {
      db.exec(AUTH_SCHEMA);
    },
  },
];

function ensureMigrationsTable(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export function getCurrentVersion(db: SqliteDatabase): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version: number };
  return row.version;
}

export interface MigrationResult {
  applied: string[];
  currentVersion: number;
}

export function runMigrations(db: SqliteDatabase): MigrationResult {
  const applied: string[] = [];

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of ordered) {
    const apply = db.transaction(() => {
      ensureMigrationsTable(db);
      const current = getCurrentVersion(db);
      if (migration.version <= current) return false;
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        nowIso()
      );
      return true;
    });

    if (migration.withoutForeignKeys) {
      db.pragma('foreign_keys = OFF');
      try {
        if (apply.immediate()) applied.push(`${migration.version}_${migration.name}`);
      } finally {
        db.pragma('foreign_keys = ON');
      }
      const violations = db.prepare('PRAGMA foreign_key_check').all();
      if (violations.length > 0) {
        throw new Error(
          `Falha na verificação de chaves estrangeiras após a migração ${migration.version}`
        );
      }
    } else {
      if (apply.immediate()) applied.push(`${migration.version}_${migration.name}`);
    }
  }

  return { applied, currentVersion: getCurrentVersion(db) };
}
