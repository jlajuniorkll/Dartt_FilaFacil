import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filafacil-auth-'));
process.env.SQLITE_PATH = path.join(tmpDir, 'auth.db');

import {
  authenticate,
  bootstrapFirstAdmin,
  createUser,
  createSession,
  deactivateUser,
  activateUser,
  findUserByEmail,
  hasRole,
  purgeExpiredSessions,
  requireAdmin,
  requireOperatorOrAdmin,
  requireUser,
  resetUserPassword,
  revokeAllSessionsForUser,
  revokeSession,
  validatePasswordStrength,
  validateSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  AuthError,
  type AuthUser,
} from '../src/lib/db/auth-service';
import { getDb, closeDb } from '../src/lib/db/connection';

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
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

const ADMIN_PASSWORD = 'adm-test-9f8e7d6c5b4a';
const OPERATOR_PASSWORD = 'op-test-1a2b3c4d5e6f';

const db = () => getDb();

const run = async () => {
  await check('bootstrap cria o primeiro administrador e recusa repetição', async () => {
    const admin = await bootstrapFirstAdmin({ email: 'admin@example.com', password: ADMIN_PASSWORD });
    assert(admin.role === 'admin', 'primeiro usuário deveria ser admin');
    let threw = false;
    try {
      await bootstrapFirstAdmin({ email: 'outro@example.com', password: ADMIN_PASSWORD });
    } catch {
      threw = true;
    }
    assert(threw, 'segundo bootstrap deveria ser recusado');
  });

  await check('hash de senha é argon2id e verifica corretamente', async () => {
    const row = db()
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get('admin@example.com') as { password_hash: string };
    assert(row.password_hash.startsWith('$argon2id$'), 'hash deveria ser argon2id');
    const { verify } = await import('@node-rs/argon2');
    assert(await verify(row.password_hash, ADMIN_PASSWORD), 'verify aceitou a senha correta');
    assert(!(await verify(row.password_hash, 'senha-errada')), 'verify recusou a senha incorreta');
  });

  let admin: AuthUser;
  await check('login do administrador é válido e emite sessão', async () => {
    const result = await authenticate('admin@example.com', ADMIN_PASSWORD);
    assert(result !== null, 'autenticação recusada');
    assert(typeof result?.sessionToken === 'string' && result.sessionToken.length >= 32, 'token fraco');
    assert(result?.user.role === 'admin', 'perfil');
    admin = { id: result!.user.id, email: result!.user.email, role: 'admin' };
  });

  await check('sessão criada valida corretamente e persiste após reabrir a conexão', async () => {
    const result = await authenticate('admin@example.com', ADMIN_PASSWORD);
    assert(result, 'login');
    closeDb(); // simula reinício do processo
    const user = validateSession(result!.sessionToken);
    assert(user?.email === 'admin@example.com', 'sessão perdida após reabrir conexão');
    assert(user?.role === 'admin', 'perfil corrompido');
  });

  await check('token armazenado no banco é hash, não o token puro', async () => {
    const result = await authenticate('admin@example.com', ADMIN_PASSWORD);
    assert(result, 'login');
    const row = db()
      .prepare('SELECT token_hash FROM sessions ORDER BY rowid DESC LIMIT 1')
      .get() as { token_hash: string };
    assert(row.token_hash !== result!.sessionToken, 'token puro vazado no banco');
    assert(/^[0-9a-f]{64}$/.test(row.token_hash), 'token_hash deveria ser sha256 hex');
    revokeSession(result!.sessionToken);
  });

  await check('criação de usuário autorizada (admin cria operator)', async () => {
    const actor = findUserByEmail('admin@example.com')!;
    const op = await createUser(actor, { email: 'operador@example.com', password: OPERATOR_PASSWORD, role: 'operator' });
    assert(op.role === 'operator', 'perfil do operador');
    assert(findUserByEmail('operador@example.com')?.email === 'operador@example.com', 'não persistiu');
  });

  await check('operador não pode criar usuários (nem admin)', async () => {
    const op = findUserByEmail('operador@example.com')!;
    let code: string | undefined;
    try {
      await createUser(op, { email: 'intruso@example.com', password: OPERATOR_PASSWORD, role: 'admin' });
    } catch (error) {
      code = error instanceof AuthError ? error.code : 'OUTRO';
    }
    assert(code === 'FORBIDDEN', `esperado FORBIDDEN, obtido ${code}`);
    let code2: string | undefined;
    try {
      await createUser(op, { email: 'intruso2@example.com', password: OPERATOR_PASSWORD, role: 'operator' });
    } catch (error) {
      code2 = error instanceof AuthError ? error.code : 'OUTRO';
    }
    assert(code2 === 'FORBIDDEN', `esperado FORBIDDEN, obtido ${code2}`);
  });

  await check('criação sem ator é recusada fora do bootstrap', async () => {
    let code: string | undefined;
    try {
      await createUser(null, { email: 'anon@example.com', password: OPERATOR_PASSWORD, role: 'operator' });
    } catch (error) {
      code = error instanceof AuthError ? error.code : 'OUTRO';
    }
    assert(code === 'UNAUTHENTICATED', `esperado UNAUTHENTICATED, obtido ${code}`);
  });

  let operatorLogin: Awaited<ReturnType<typeof authenticate>>;
  await check('login de operador é válido', async () => {
    operatorLogin = await authenticate('operador@example.com', OPERATOR_PASSWORD);
    assert(operatorLogin !== null, 'autenticação do operador recusada');
    assert(operatorLogin?.user.role === 'operator', 'perfil');
  });

  await check('senha incorreta é recusada com retorno nulo (sem vazar motivo)', async () => {
    const result = await authenticate('operador@example.com', 'senha-totalmente-errada-123');
    assert(result === null, 'senha errada autenticada');
  });

  await check('usuário inexistente retorna nulo', async () => {
    const result = await authenticate('ninguem@example.com', 'qualquer-coisa-123');
    assert(result === null, 'usuário inventado autenticado');
  });

  await check('operador não acessa ação de administrador (requireAdmin)', () => {
    let code: string | undefined;
    try {
      requireAdmin(operatorLogin!.sessionToken);
    } catch (error) {
      code = error instanceof AuthError ? error.code : 'OUTRO';
    }
    assert(code === 'FORBIDDEN', `esperado FORBIDDEN, obtido ${code}`);
    requireOperatorOrAdmin(operatorLogin!.sessionToken); // não deve lançar
    requireUser(operatorLogin!.sessionToken); // não deve lançar
  });

  await check('administrador acessa ações administrativas', () => {
    const adminUser = findUserByEmail('admin@example.com')!;
    assert(adminUser.role === 'admin', 'perfil');
    const adminSession = createSession(adminUser.id);
    requireAdmin(adminSession.sessionToken);
    requireOperatorOrAdmin(adminSession.sessionToken);
    hasRole(findUserByEmail('admin@example.com'), ['admin']);
    revokeSession(adminSession.sessionToken);
  });

  await check('logout revoga a sessão', async () => {
    const result = await authenticate('admin@example.com', ADMIN_PASSWORD);
    assert(result, 'login');
    assert(validateSession(result!.sessionToken), 'sessão deveria estar válida');
    revokeSession(result!.sessionToken);
    assert(validateSession(result!.sessionToken) === null, 'sessão ainda válida após logout');
  });

  await check('token inválido é recusado', () => {
    assert(validateSession('token-lixo-123') === null, 'token fabricado aceito');
    assert(validateSession('') === null, 'token vazio aceito');
  });

  await check('sessão expirada é recusada', async () => {
    const result = await authenticate('admin@example.com', ADMIN_PASSWORD);
    assert(result, 'login');
    db().prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
    assert(validateSession(result!.sessionToken) === null, 'sessão expirada aceita');
  });

  await check('sessão revogada individualmente é recusada', async () => {
    const result = await authenticate('admin@example.com', ADMIN_PASSWORD);
    assert(result, 'login');
    revokeSession(result!.sessionToken);
    assert(validateSession(result!.sessionToken) === null, 'sessão revogada aceita');
  });

  await check('desativar usuário invalida login e sessões existentes', async () => {
    const actor = findUserByEmail('admin@example.com')!;
    const session = await authenticate('operador@example.com', OPERATOR_PASSWORD);
    assert(session, 'login operador');
    const op = findUserByEmail('operador@example.com')!;
    deactivateUser(actor, op.id);
    assert(validateSession(session!.sessionToken) === null, 'sessão do desativado ainda válida');
    const blocked = await authenticate('operador@example.com', OPERATOR_PASSWORD);
    assert(blocked === null, 'login de usuário desativado aceito');
    activateUser(actor, op.id);
    const restored = await authenticate('operador@example.com', OPERATOR_PASSWORD);
    assert(restored !== null, 'usuário reativado não conseguiu logar');
  });

  await check('desativar o último administrador ativo é recusado', async () => {
    const admins = db().prepare("SELECT id FROM users WHERE role = 'admin' AND disabled_at IS NULL").all() as { id: string }[];
    assert(admins.length === 1, `esperado 1 admin ativo, obtido ${admins.length}`);
    const actor = findUserByEmail('admin@example.com')!;
    let threw = false;
    try {
      deactivateUser(actor, actor.id);
    } catch (error) {
      threw = true;
    }
    assert(threw, 'auto-desativação deveria ser recusada');
  });

  await check('tentativas repetidas travam o login mesmo com senha correta', async () => {
    const email = 'bruteforce@example.com';
    const actor = findUserByEmail('admin@example.com')!;
    await createUser(actor, { email, password: OPERATOR_PASSWORD, role: 'operator' });
    for (let i = 0; i < 5; i += 1) {
      const attempt = await authenticate(email, `senha-errada-${i}-xxxxxxxx`);
      assert(attempt === null, `tentativa ${i + 1} deveria falhar`);
    }
    const locked = await authenticate(email, OPERATOR_PASSWORD);
    assert(locked === null, 'usuário bloqueado deveria falhar mesmo com senha correta');
    // Fora da janela de 15 minutos, o acesso volta
    db().prepare('UPDATE login_attempts SET attempted_at = ? WHERE email = ?').run(
      new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      email
    );
    const unlocked = await authenticate(email, OPERATOR_PASSWORD);
    assert(unlocked !== null, 'usuário deveria voltar a logar após a janela de bloqueio');
  });

  await check('sessões persistem após reinício e limpeza remove apenas expiradas', async () => {
    const email = 'persist@example.com';
    const actor = findUserByEmail('admin@example.com')!;
    await createUser(actor, { email, password: OPERATOR_PASSWORD, role: 'operator' });
    const session = await authenticate(email, OPERATOR_PASSWORD);
    assert(session, 'login');
    closeDb();
    assert(validateSession(session!.sessionToken) !== null, 'sessão não persistiu');
    db().prepare('UPDATE sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(
      new Date(Date.now() - 1000).toISOString(),
      email
    );
    const purged = purgeExpiredSessions();
    assert(purged >= 1, 'limpeza não removeu sessões expiradas');
    assert(validateSession(session!.sessionToken) === null, 'sessão expirada deveria estar fora');
  });

  await check('resetUserPassword revoga todas as sessões do usuário', async () => {
    const email = 'reset@example.com';
    const actor = findUserByEmail('admin@example.com')!;
    await createUser(actor, { email, password: OPERATOR_PASSWORD, role: 'operator' });
    const s1 = await authenticate(email, OPERATOR_PASSWORD);
    const s2 = await authenticate(email, OPERATOR_PASSWORD);
    const userId = findUserByEmail(email)!.id;
    await resetUserPassword(userId, 'nova-senha-987654321abc');
    assert(validateSession(s1!.sessionToken) === null, 'sessão 1 deveria ser revogada');
    assert(validateSession(s2!.sessionToken) === null, 'sessão 2 deveria ser revogada');
    assert((await authenticate(email, OPERATOR_PASSWORD)) === null, 'senha antiga ainda válida');
    assert((await authenticate(email, 'nova-senha-987654321abc')) !== null, 'senha nova não funciona');
  });

  await check('ausência de credenciais padrão em banco novo', async () => {
    const freshPath = path.join(tmpDir, 'fresh.db');
    process.env.SQLITE_PATH = freshPath;
    closeDb();
    const { initializeDatabase } = await import('../src/lib/db/init');
    initializeDatabase();
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
    assert(count.c === 0, `banco novo deveria ter 0 usuários, obtido ${count.c}`);
    process.env.SQLITE_PATH = path.join(tmpDir, 'auth.db');
    closeDb();
  });

  await check('integridade das migrações: versão 3 aplicada e idempotente', () => {
    const versions = db().prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[];
    assert(JSON.stringify(versions.map((v) => v.version)) === JSON.stringify([1, 2, 3]), `versões=${JSON.stringify(versions)}`);
    const tables = db()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sessions', 'login_attempts')")
      .all() as { name: string }[];
    assert(tables.length === 2, 'tabelas de auth ausentes');
    const sessionSql = db().prepare("SELECT sql FROM sqlite_master WHERE name = 'sessions'").get() as { sql: string };
    assert(sessionSql.sql.includes('token_hash'), 'sessions sem token_hash');
    const userCols = db().prepare('PRAGMA table_info(users)').all() as { name: string }[];
    assert(userCols.some((c) => c.name === 'disabled_at'), 'users sem disabled_at');
    assert(userCols.some((c) => c.name === 'last_login_at'), 'users sem last_login_at');
  });

  await check('força de senha: mínimo 12 caracteres com letras e números', () => {
    assert(validatePasswordStrength('curta1') !== null, 'senha curta aceita');
    assert(validatePasswordStrength('so-letras-sem-numero') !== null, 'sem número aceita');
    assert(validatePasswordStrength('123456789012') !== null, 'sem letras aceita');
    assert(validatePasswordStrength('Senha-Forte-1234') === null, 'senha forte recusada');
  });

  await check('revokeAllSessionsForUser revoga todas as sessões ativas', async () => {
    const email = 'revoke-all@example.com';
    const actor = findUserByEmail('admin@example.com')!;
    await createUser(actor, { email, password: OPERATOR_PASSWORD, role: 'operator' });
    const s1 = await authenticate(email, OPERATOR_PASSWORD);
    const s2 = await authenticate(email, OPERATOR_PASSWORD);
    const userId = findUserByEmail(email)!.id;
    revokeAllSessionsForUser(userId);
    assert(validateSession(s1!.sessionToken) === null, 's1 não revogada');
    assert(validateSession(s2!.sessionToken) === null, 's2 não revogada');
  });

  await check('constantes de sessão e cookie seguras por construção', () => {
    assert(SESSION_MAX_AGE_SECONDS === 60 * 60 * 24 * 7, 'max age inesperado');
    assert(SESSION_COOKIE === 'filafacil_session', 'nome do cookie inesperado');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} testes de autenticação passaram.`);

  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failed.length > 0) process.exit(1);
};

run().catch((error) => {
  console.error('Erro fatal nos testes de autenticação:', error);
  closeDb();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignora
  }
  process.exit(1);
});
