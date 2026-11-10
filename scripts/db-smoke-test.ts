import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filafacil-smoke-'));
process.env.SQLITE_PATH = path.join(tmpDir, 'smoke.db');

import { getDb, closeDb, getSqlitePath } from '../src/lib/db/connection';
import { initializeDatabase } from '../src/lib/db/init';
import { getBusinessDate } from '../src/lib/db/time';

const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.error(`FAIL ${name}: ${detail}`);
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const db = getDb();

check('caminho do banco vem de SQLITE_PATH', () => {
  assert(getSqlitePath() === process.env.SQLITE_PATH, 'getSqlitePath não respeitou SQLITE_PATH');
});

check('WAL habilitado', () => {
  const row = db.pragma('journal_mode', { simple: true }) as string;
  assert(String(row).toLowerCase() === 'wal', `journal_mode=${row}`);
});

check('busy_timeout configurado (5000ms)', () => {
  const row = db.pragma('busy_timeout', { simple: true }) as number;
  assert(Number(row) === 5000, `busy_timeout=${row}`);
});

check('foreign_keys habilitado', () => {
  const row = db.pragma('foreign_keys', { simple: true }) as number;
  assert(Number(row) === 1, `foreign_keys=${row}`);
});

check('inicialização é idempotente', () => {
  const first = initializeDatabase();
  const second = initializeDatabase();
  assert(first.currentVersion === 3, `versão inesperada: ${first.currentVersion}`);
  assert(first.migrationsApplied.join(',') === '1_initial_schema,2_ticket_types_active_and_tickets_unique_removed,3_auth_sessions_and_login_attempts', `migrações inesperadas: ${first.migrationsApplied.join(',')}`);
  assert(second.migrationsApplied.length === 0, 'migrações reaplicadas na segunda execução');
  assert(second.seeded.length === 0, `seeds reaplicados: ${second.seeded.join(',')}`);
});

check('dados iniciais não sensíveis presentes e sem usuários', () => {
  const profiles = db.prepare('SELECT COUNT(*) AS c FROM profiles').get() as { c: number };
  const settings = db.prepare('SELECT id, priority_enabled, total_counters FROM settings WHERE id = 1').get() as
    | { id: number; priority_enabled: number; total_counters: number }
    | undefined;
  const types = db.prepare('SELECT COUNT(*) AS c FROM ticket_types').get() as { c: number };
  const urls = db.prepare('SELECT COUNT(*) AS c FROM youtube_urls').get() as { c: number };
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  assert(profiles.c === 2, `profiles=${profiles.c}`);
  assert(settings?.id === 1 && settings.priority_enabled === 1 && settings.total_counters === 5, 'settings padrão ausente');
  assert(types.c === 2, `ticket_types=${types.c}`);
  assert(urls.c === 2, `youtube_urls=${urls.c}`);
  assert(users.c === 0, 'usuários não deveriam ser semeados');
});

check('business_date respeita America/Sao_Paulo', () => {
  const d = getBusinessDate(new Date('2026-01-15T01:30:00.000Z'));
  assert(d === '2026-01-14', `esperado 2026-01-14, obtido ${d}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(getBusinessDate()), 'formato inválido');
});

check('transação de emissão é atômica (commit)', () => {
  const businessDate = getBusinessDate();
  const ts = new Date().toISOString();
  const emit = db.transaction(() => {
    db.prepare(
      `INSERT INTO daily_sequences (business_date, ticket_type_id, last_number, updated_at)
       VALUES (?, 'btn-1', 1, ?)
       ON CONFLICT (business_date, ticket_type_id)
       DO UPDATE SET last_number = last_number + 1, updated_at = excluded.updated_at`
    ).run(businessDate, ts);
    const seq = db.prepare('SELECT last_number FROM daily_sequences WHERE business_date = ? AND ticket_type_id = ?').get(businessDate, 'btn-1') as { last_number: number };
    db.prepare(
      `INSERT INTO tickets (id, business_date, ticket_number, ticket_type_id, prefix, display_number, issued_at)
       VALUES (?, ?, ?, 'btn-1', 'P', ?, ?)`
    ).run(`smoke-${process.pid}-${seq.last_number}`, businessDate, `P${String(seq.last_number).padStart(3, '0')}`, seq.last_number, ts);
    return seq.last_number;
  });
  assert(emit() === 1, 'sequência não iniciou em 1');
  assert(emit() === 2, 'sequência não avançou para 2');
});

check('transação com falha faz rollback integral', () => {
  const businessDate = getBusinessDate();
  const before = db.prepare('SELECT COUNT(*) AS c FROM tickets').get() as { c: number };
  const failing = db.transaction(() => {
    db.prepare(
      `INSERT INTO tickets (id, business_date, ticket_number, ticket_type_id, prefix, display_number, issued_at)
       VALUES (?, ?, 'PX01', 'btn-1', 'P', 999, ?)`
    ).run(`smoke-${process.pid}-rollback`, businessDate, new Date().toISOString());
    throw new Error('falha proposital para validar rollback');
  });
  try {
    failing();
    throw new Error('transação deveria ter falhado');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('falha proposital'), 'erro inesperado');
  }
  const after = db.prepare('SELECT COUNT(*) AS c FROM tickets').get() as { c: number };
  assert(after.c === before.c, 'rollback não desfez o insert');
});

check('numeração por dia/tipo possui índice (sem UNIQUE, semântica de reset)', () => {
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tickets'")
    .all() as { name: string }[];
  const names = indexes.map((i) => i.name);
  assert(
    names.includes('idx_tickets_business_date_type_number'),
    `índice idx_tickets_business_date_type_number ausente: ${names.join(',')}`
  );
  const businessDate = getBusinessDate();
  const dup = db.prepare(
    `INSERT INTO tickets (id, business_date, ticket_number, ticket_type_id, prefix, display_number, issued_at)
     VALUES (?, ?, 'P900', 'btn-1', 'P', 900, ?)`
  );
  dup.run(`smoke-${process.pid}-dup1`, businessDate, new Date().toISOString());
  dup.run(`smoke-${process.pid}-dup2`, businessDate, new Date().toISOString());
});

check('foreign_keys rejeita ticket_type inexistente', () => {
  const businessDate = getBusinessDate();
  let threw = false;
  try {
    db.prepare(
      `INSERT INTO tickets (id, business_date, ticket_number, ticket_type_id, prefix, display_number, issued_at)
       VALUES (?, ?, 'X001', 'tipo-inexistente', 'X', 1, ?)`
    ).run(`smoke-${process.pid}-fk`, businessDate, new Date().toISOString());
  } catch {
    threw = true;
  }
  assert(threw, 'FK não foi aplicada');
});

check('histórico de chamada referencia senha existente', () => {
  const businessDate = getBusinessDate();
  const ticket = db.prepare('SELECT id FROM tickets ORDER BY issued_at LIMIT 1').get() as { id: string };
  db.prepare(
    'INSERT INTO call_history (business_date, ticket_id, called_at, counter, is_repeat) VALUES (?, ?, ?, 1, 0)'
  ).run(businessDate, ticket.id, new Date().toISOString());
  const row = db.prepare('SELECT COUNT(*) AS c FROM call_history WHERE ticket_id = ?').get(ticket.id) as { c: number };
  assert(row.c >= 1, 'histórico não gravado');
});

check('schema_migrations registra versão 1 initial_schema', () => {
  const row = db.prepare('SELECT name FROM schema_migrations WHERE version = 1').get() as { name: string } | undefined;
  assert(row?.name === 'initial_schema', `registro inesperado: ${row?.name}`);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes passaram.`);

closeDb();
fs.rmSync(tmpDir, { recursive: true, force: true });

if (failed.length > 0) process.exit(1);
