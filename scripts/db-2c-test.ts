import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const workerMode = process.env.FILAFACIL_TEST_WORKER;
const tmpDir = workerMode ? '' : fs.mkdtempSync(path.join(os.tmpdir(), 'filafacil-2c-'));
if (!workerMode && !process.env.SQLITE_PATH) {
  process.env.SQLITE_PATH = path.join(tmpDir, 'integration.db');
}

import {
  authenticate,
  bootstrapFirstAdmin,
  createUser,
  AuthError,
  type AuthUser,
} from '../src/lib/db/auth-service';
import {
  getSettings,
  updateSettings,
  generateTicket,
  getPendingTickets,
  callNextTicket,
  repeatLastCall,
  getQueueStatus,
  resetQueue,
  getDashboardStats,
} from '../src/lib/db/queue-service';
import { assertRole, assertAdmin, assertOperatorOrAdmin } from '../src/lib/auth/guards';
import { getDb, closeDb } from '../src/lib/db/connection';

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    results.push({ name, ok: false, detail });
    console.error(`FAIL ${name}: ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function workerEnv(): NodeJS.ProcessEnv {
  return { ...process.env, SQLITE_PATH: process.env.SQLITE_PATH };
}

const ADMIN_PASSWORD = 'adm-2c-test-987654321';
const OPERATOR_PASSWORD = 'op-2c-test-123456789';

let admin: AuthUser;
let operator: AuthUser;

async function main() {
  const workerMode = process.env.FILAFACIL_TEST_WORKER;
  if (workerMode === 'call-concurrent') {
    const counterArg = Number(process.env.FILAFACIL_TEST_COUNTER ?? '1');
    for (let i = 0; i < 5; i += 1) {
      await callNextTicket(counterArg);
    }
    closeDb();
    process.exit(0);
  }

  await check('bootstrap do primeiro administrador (pré-requisito da integração)', async () => {
    admin = await bootstrapFirstAdmin({ email: 'admin@2c.local', password: ADMIN_PASSWORD });
    const actor = admin;
    operator = await createUser(actor, { email: 'operador@2c.local', password: OPERATOR_PASSWORD, role: 'operator' });
  });

  await check('login válido emite sessão e último login é registrado', async () => {
    const result = await authenticate('admin@2c.local', ADMIN_PASSWORD);
    assert(result !== null, 'autenticação recusada');
    const row = getDb()
      .prepare('SELECT last_login_at FROM users WHERE email = ?')
      .get('admin@2c.local') as { last_login_at: string | null };
    assert(row.last_login_at !== null, 'last_login_at não registrado');
  });

  await check('login inválido é recusado', async () => {
    const bad = await authenticate('admin@2c.local', 'senha-totalmente-errada-123');
    assert(bad === null, 'senha errada aceita');
    const ghost = await authenticate('fantasma@2c.local', ADMIN_PASSWORD);
    assert(ghost === null, 'usuário inventado aceito');
  });

  await check('logout revoga a sessão do usuário', async () => {
    const result = await authenticate('operador@2c.local', OPERATOR_PASSWORD);
    assert(result, 'login operador');
    const { validateSession, revokeSession } = await import('../src/lib/db/auth-service');
    assert(validateSession(result!.sessionToken) !== null, 'sessão válida');
    revokeSession(result!.sessionToken);
    assert(validateSession(result!.sessionToken) === null, 'sessão válida após logout');
  });

  await check('sessão expirada é recusada', async () => {
    const result = await authenticate('admin@2c.local', ADMIN_PASSWORD);
    assert(result, 'login');
    const { validateSession } = await import('../src/lib/db/auth-service');
    getDb()
      .prepare('UPDATE sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)')
      .run(new Date(Date.now() - 1000).toISOString(), 'admin@2c.local');
    assert(validateSession(result!.sessionToken) === null, 'sessão expirada aceita');
  });

  await check('emissão pública funciona sem sessão', async () => {
    const ticket = await generateTicket('btn-2');
    assert(ticket.ticketNumber === 'N001', `ticketNumber=${ticket.ticketNumber}`);
  });

  await check('emissão com tipo inexistente é recusada', async () => {
    let threw = false;
    try {
      await generateTicket('btn-inexistente');
    } catch {
      threw = true;
    }
    assert(threw, 'tipo inválido aceito');
  });

  await check('chamada sem autenticação é bloqueada pela guarda (UNAUTHENTICATED)', () => {
    let code: string | undefined;
    try {
      assertOperatorOrAdmin(null);
    } catch (error) {
      code = error instanceof AuthError ? error.code : 'OUTRO';
    }
    assert(code === 'UNAUTHENTICATED', `esperado UNAUTHENTICATED, obtido ${code}`);
    let codeAdmin: string | undefined;
    try {
      assertAdmin(null);
    } catch (error) {
      codeAdmin = error instanceof AuthError ? error.code : 'OUTRO';
    }
    assert(codeAdmin === 'UNAUTHENTICATED', 'guarda de admin não recusou');
  });

  await check('operador não executa ação administrativa (FORBIDDEN)', () => {
    for (const fn of [assertAdmin]) {
      let code: string | undefined;
      try {
        fn(operator);
      } catch (error) {
        code = error instanceof AuthError ? error.code : 'OUTRO';
      }
      assert(code === 'FORBIDDEN', `esperado FORBIDDEN, obtido ${code}`);
    }
  });

  await check('administrador acessa configurações e atualiza settings', async () => {
    assertAdmin(admin);
    const settings = await getSettings();
    const updated = { ...settings, totalCounters: 9 };
    const saved = await updateSettings(updated);
    assert(saved.totalCounters === 9, 'totalCounters não atualizou');
    await updateSettings({ ...settings, totalCounters: settings.totalCounters });
  });

  await check('operador acessa ações de chamada mas não a guarda de admin', async () => {
    assertOperatorOrAdmin(operator);
    // admin também consegue (hierarquia operacional)
    assertOperatorOrAdmin(admin);
  });

  await check('chamada simultânea por dois operadores não repete senha', async () => {
    for (let i = 0; i < 10; i += 1) {
      await generateTicket('btn-1');
    }
    const runWorker = (counter: number) =>
      new Promise<number>((resolve, reject) => {
        const child = spawn(
          path.join(process.cwd(), 'node_modules', '.bin', 'tsx'),
          [path.join(process.cwd(), 'scripts', 'db-2c-test.ts')],
          {
            env: {
              ...workerEnv(),
              FILAFACIL_TEST_WORKER: 'call-concurrent',
              FILAFACIL_TEST_COUNTER: String(counter),
            },
            stdio: 'ignore',
          }
        );
        child.on('error', reject);
        child.on('close', (code) => resolve(code ?? 1));
      });
    const codes = await Promise.all([runWorker(1), runWorker(2)]);
    assert(codes.every((c) => c === 0), `workers falharam: ${codes.join(',')}`);
    const db = getDb();
    const row = db
      .prepare('SELECT COUNT(DISTINCT ticket_id) AS c FROM call_history')
      .get() as { c: number };
    assert(row.c >= 10, `chamadas distintas=${row.c} (esperado >= 10)`);
  });

  await check('repetição de chamada reaproveita a última senha', async () => {
    const repeat = await repeatLastCall();
    assert(repeat !== null, 'sem chamada anterior');
    assert(repeat?.isRepeat === true, 'isRepeat esperado');
  });

  await check('atualização do painel: status público reflete último chamado e vídeos', async () => {
    const status = await getQueueStatus();
    assert(Array.isArray(status.history), 'histórico ausente');
    assert(status.lastCalled !== null, 'lastCalled deveria existir após chamadas');
    assert(status.videos.length > 0, 'vídeos ausentes (config padrão não carregada?)');
    assert(status.history.length <= 10, 'histórico acima do teto');
  });

  await check('reset sem permissão é bloqueado pela guarda (FORBIDDEN)', () => {
    let code: string | undefined;
    try {
      assertRole(operator, ['admin']);
    } catch (error) {
      code = error instanceof AuthError ? error.code : 'OUTRO';
    }
    assert(code === 'FORBIDDEN', `esperado FORBIDDEN, obtido ${code}`);
  });

  await check('reset com permissão limpa a fila do dia', async () => {
    assertAdmin(admin);
    await resetQueue();
    const pending = await getPendingTickets();
    assert(pending.length === 0, `pendentes=${pending.length} após reset`);
    const status = await getQueueStatus();
    assert(status.history.length === 0, 'histórico deveria ser vazio após reset do dia');
  });

  await check('dashboard calcula estatísticas a partir do SQLite', async () => {
    await generateTicket('btn-1');
    await generateTicket('btn-2');
    const stats = await getDashboardStats({ from: new Date(), to: new Date() });
    assert(typeof stats.totalIssued === 'number', 'totalIssued');
    assert(typeof stats.waitingCount === 'number', 'waitingCount');
    assert(Array.isArray(stats.ticketsByType), 'ticketsByType');
    assert(Array.isArray(stats.ticketsByCounter), 'ticketsByCounter');
  });

  await check('persistência após reinicialização do processo', async () => {
    const before = await getPendingTickets();
    closeDb();
    const after = await getPendingTickets();
    assert(after.length === before.length, 'pendentes mudaram');
    assert(JSON.stringify(after.map((t) => t.id)) === JSON.stringify(before.map((t) => t.id)), 'ids mudaram');
  });

  await check('fluxo ativo não importa firebase em nenhum módulo', () => {
    const files = [
      'src/lib/data.ts',
      'src/lib/actions.ts',
      'src/lib/auth/actions.ts',
      'src/lib/auth/auth-context.tsx',
      'src/lib/auth/authorization.ts',
      'src/lib/auth/session.ts',
      'src/lib/auth/guards.ts',
      'src/app/login/login-form.tsx',
      'src/app/api/queue/status/route.ts',
      'src/app/layout.tsx',
      'src/app/page.tsx',
      'src/components/Header.tsx',
    ];
    for (const file of files) {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      assert(!/from\s+['"]firebase|from\s+['"]@\/lib\/firebase|require\(['"]firebase/.test(content), `${file} ainda importa firebase`);
    }
  });

  await check('server actions protegidas possuem guarda e erro genérico seguro', () => {
    const data = fs.readFileSync(path.join(process.cwd(), 'src/lib/data.ts'), 'utf8');
    const guarded = ['updateSettings', 'getDashboardStats', 'resetQueue', 'resetSequenceCounters', 'callNextTicket', 'getPendingTickets', 'repeatLastCall', 'callNextTicketByType'];
    for (const fn of guarded) {
      const fnMatch = data.match(new RegExp(`export async function ${fn}[\\s\\S]*?\\n}`));
      assert(fnMatch !== null, `função ${fn} não encontrada em data.ts`);
      assert(/assert(Admin|OperatorOrAdmin|Role)\(/.test(fnMatch[0]), `${fn} sem guarda de autorização`);
    }
    for (const publicFn of ['getSettings', 'generateTicket', 'getQueueStatus']) {
      const fnMatch = data.match(new RegExp(`export async function ${publicFn}[\\s\\S]*?\\n}`));
      assert(fnMatch !== null, `função ${publicFn} não encontrada em data.ts`);
      assert(!/assert(Admin|OperatorOrAdmin|Role)\(/.test(fnMatch[0]), `${publicFn} (pública) não deveria ter guarda de papel`);
    }
    const actions = fs.readFileSync(path.join(process.cwd(), 'src/lib/actions.ts'), 'utf8');
    assert(actions.includes('Erro interno do servidor.'), 'actions vaza erro interno ao cliente');
    assert(actions.includes("error instanceof AuthError"), 'actions não diferencia AuthError');
  });

  await check('firebase removido das dependências (Fase 2D)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    assert(pkg.scripts['db:test:auth'], 'db:test:auth ausente');
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!allDeps?.firebase, 'firebase ainda está instalado');
    assert(!allDeps?.genkit, 'genkit deveria ter sido removido (fase 2E)');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} testes de integração passaram.`);

  closeDb();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  console.error('Erro fatal nos testes de integração:', error);
  closeDb();
  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignora
  }
  process.exit(1);
});
