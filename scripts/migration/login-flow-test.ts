import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (fs.statfsSync('/').bavail * fs.statfsSync('/').bsize < 5_000_000_000) {
  console.error('ERRO: menos de 5 GB livres em /. Teste abortado.');
  process.exit(2);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filafacil-login-test-'));
const dbPath = path.join(tmpDir, 'login-test.db');
process.env.SQLITE_PATH = dbPath;

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  try {
    const value = fn();
    if (value instanceof Promise) {
      return value.then(
        () => {
          results.push({ name, ok: true });
          console.log(`PASS ${name}`);
        },
        (error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          results.push({ name, ok: false, detail });
          console.error(`FAIL ${name}: ${detail}`);
        }
      );
    }
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.error(`FAIL ${name}: ${detail}`);
  }
}

async function main() {
  const { initializeDatabase } = await import('../../src/lib/db/init');
  const Database = (await import('better-sqlite3')).default;
  initializeDatabase();

  const seedDb = new Database(dbPath);
  const { hash: argon2Hash } = await import('@node-rs/argon2');
  const ts = new Date().toISOString();
  const adminHash = await argon2Hash('AdminSenha-Teste-2026', { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  seedDb.prepare(
    `INSERT INTO users (id, email, role, password_hash, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?, ?)`
  ).run('test-admin-1', 'login-admin@example.invalid', adminHash, ts, ts);
  seedDb.prepare(
    `INSERT INTO users (id, email, role, password_hash, created_at, updated_at) VALUES (?, ?, 'operator', NULL, ?, ?)`
  ).run('test-operator-null-1', 'login-operator-sem-senha@example.invalid', ts, ts);
  seedDb.close();

  const { authenticate, createSession, validateSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } = await import(
    '../../src/lib/db/auth-service'
  );

  await check('login valido (admin argon2id) autentica', async () => {
    const result = await authenticate('login-admin@example.invalid', 'AdminSenha-Teste-2026', { ip: '127.0.0.1' });
    if (!result) throw new Error('authenticate retornou null para credenciais validas');
    if (result.user.role !== 'admin') throw new Error(`role=${result.user.role}`);
    if (!result.sessionToken.startsWith('eyJ') && result.sessionToken.length < 40) throw new Error('token inesperado');
  });

  await check('senha errada e recusada com resposta generica', async () => {
    const result = await authenticate('login-admin@example.invalid', 'senha-errada-2026');
    if (result !== null) throw new Error('authenticate aceitou senha incorreta');
  });

  await check('usuario com password_hash NULL nao autentica (forma de producao)', async () => {
    const result = await authenticate('login-operator-sem-senha@example.invalid', 'qualquer-senha-2026');
    if (result !== null) throw new Error('authenticate aceitou usuario sem hash');
  });

  await check('sessao criada e validada (token hash no SQLite)', async () => {
    const { sessionToken } = createSession('test-admin-1', { ip: '127.0.0.1', userAgent: 'login-test' });
    const user = validateSession(sessionToken);
    if (!user) throw new Error('validateSession retornou null');
    if (user.id !== 'test-admin-1' || user.role !== 'admin') throw new Error('usuario divergente na sessao');
  });

  await check('sessao revogada nao valida', async () => {
    const db = new Database(dbPath);
    const { sessionToken } = createSession('test-admin-1');
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(ts, 'test-admin-1');
    db.close();
    if (validateSession(sessionToken) !== null) throw new Error('sessao revogada ainda valida');
  });

  await check('sessao expirada nao valida', async () => {
    const created = createSession('test-admin-1', {}, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    if (validateSession(created.sessionToken) !== null) throw new Error('sessao expirada ainda valida');
  });

  await check('lockout apos 5 falhas (mesmo com senha correta)', async () => {
    for (let i = 0; i < 5; i += 1) {
      await authenticate('login-admin@example.invalid', 'senha-errada-2026');
    }
    const result = await authenticate('login-admin@example.invalid', 'AdminSenha-Teste-2026');
    if (result !== null) throw new Error('lockout nao ativado apos 5 falhas');
  });

  await check('constante de cookie (sessao longa)', () => {
    if (SESSION_COOKIE !== 'filafacil_session') throw new Error(`SESSION_COOKIE=${SESSION_COOKIE}`);
    if (SESSION_MAX_AGE_SECONDS !== 7 * 24 * 60 * 60) throw new Error(`SESSION_MAX_AGE_SECONDS=${SESSION_MAX_AGE_SECONDS}`);
  });

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram`);
  if (failed.length > 0) {
    console.error('BANCO DE TESTE PRESERVADO EM:', tmpDir);
    process.exit(1);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((error) => {
  console.error('ERRO FATAL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
