import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const workerMode = process.env.FILAFACIL_TEST_WORKER;
const tmpDir = workerMode ? '' : fs.mkdtempSync(path.join(os.tmpdir(), 'filafacil-service-'));
if (!workerMode && !process.env.SQLITE_PATH) {
  process.env.SQLITE_PATH = path.join(tmpDir, 'service.db');
}

import {
  getSettings,
  updateSettings,
  generateTicket,
  getPendingTickets,
  callNextTicket,
  callNextTicketByType,
  repeatLastCall,
  getQueueStatus,
  resetQueue,
  resetSequenceCounters,
  getDashboardStats,
} from '../src/lib/db/queue-service';
import { getDb, closeDb } from '../src/lib/db/connection';
import { getBusinessDate } from '../src/lib/db/time';
import type { AppSettings } from '../src/lib/types';

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

function cloneSettings(settings: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(settings)) as AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  buttons: [
    { id: 'btn-1', name: 'Preferencial', prefix: 'P', priority: 1, frequency: 2, automaticNumbering: true, startNumber: 1, color: '#5DADE2', textColor: '#FFFFFF' },
    { id: 'btn-2', name: 'Normal', prefix: 'N', priority: 2, frequency: 1, automaticNumbering: true, startNumber: 1, color: '#F39C12', textColor: '#FFFFFF' },
  ],
  youtubeUrls: [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=3Z1_p7-v7v8',
  ],
  priorityEnabled: true,
  counterConfiguration: 'none',
  totalCounters: 5,
};

async function main() {
  const workerRuntimeMode = process.env.FILAFACIL_TEST_WORKER;
  if (workerRuntimeMode === 'emit') {
    for (let i = 0; i < 10; i += 1) {
      await generateTicket('btn-2');
    }
    closeDb();
    process.exit(0);
  }
  if (workerMode === 'call') {
    for (let i = 0; i < 5; i += 1) {
      await callNextTicket(1);
    }
    closeDb();
    process.exit(0);
  }

  const now = new Date();
  const day2 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const day3 = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const originalSettings = await getSettings();

  await check('emissão normal gera senha com prefixo e número do dia', async () => {
    const ticket = await generateTicket('btn-2', now);
    assert(ticket.ticketNumber === 'N001', `ticketNumber=${ticket.ticketNumber}`);
    assert(ticket.displayNumber === 1, 'displayNumber');
    assert(ticket.called === false, 'called deveria iniciar false');
    assert(ticket.prefix === 'N', 'prefix');
    assert(typeof ticket.id === 'string' && ticket.id.length > 0, 'id interno');
  });

  await check('emissão preferencial usa sequência própria por tipo', async () => {
    const first = await generateTicket('btn-1', now);
    assert(first.ticketNumber === 'P001', `ticketNumber=${first.ticketNumber}`);
    const second = await generateTicket('btn-1', now);
    assert(second.ticketNumber === 'P002', `ticketNumber=${second.ticketNumber}`);
  });

  await check('numeração diária persiste em daily_sequences', () => {
    const db = getDb();
    const businessDate = getBusinessDate(now);
    const seq = db
      .prepare('SELECT last_number FROM daily_sequences WHERE business_date = ? AND ticket_type_id = ?')
      .get(businessDate, 'btn-2') as { last_number: number } | undefined;
    assert(seq?.last_number === 1, `seq btn-2=${seq?.last_number}`);
  });

  await check('mudança de dia operacional reinicia a numeração', async () => {
    const ticket = await generateTicket('btn-2', day2);
    assert(ticket.displayNumber === 1, `displayNumber no dia seguinte=${ticket.displayNumber}`);
    assert(ticket.ticketNumber === 'N001', `ticketNumber=${ticket.ticketNumber}`);
    const pendingToday = await getPendingTickets(now);
    assert(pendingToday.length === 3, `pendentes hoje=${pendingToday.length} (N001, P001, P002)`);
    const pendingTomorrow = await getPendingTickets(day2);
    assert(pendingTomorrow.length === 1, `pendentes amanhã=${pendingTomorrow.length}`);
  });

  await check('chamada por prioridade respeita frequência (P2, N1)', async () => {
    await generateTicket('btn-1', now); // P003
    await generateTicket('btn-1', now); // P004
    // Pendentes: N001, P001..P004
    const call1 = await callNextTicket(1, now);
    assert(call1?.type === 'btn-1', `chamada 1=${call1?.type}`);
    const call2 = await callNextTicket(1, now);
    assert(call2?.type === 'btn-1', `chamada 2=${call2?.type}`);
    const call3 = await callNextTicket(1, now);
    assert(call3?.type === 'btn-2', `chamada 3=${call3?.type}`);
    const call4 = await callNextTicket(1, now);
    assert(call4?.type === 'btn-1', `chamada 4 (após reset de ciclo)=${call4?.type}`);
  });

  await check('chamada por tipo seleciona o mais antigo do tipo', async () => {
    await generateTicket('btn-2', now); // N002
    const call = await callNextTicketByType('btn-2', 3, now);
    assert(call?.type === 'btn-2', `tipo=${call?.type}`);
    assert(call?.counter === 3, 'counter');
    assert(call?.ticketNumber === 'N002', `esperado N002, obtido ${call?.ticketNumber}`);
    const again = await callNextTicketByType('btn-2', 3, now);
    assert(again === null, 'não deveria haver senha btn-2 pendente no dia');
  });

  await check('reincidência de chamada não marca senha já chamada', async () => {
    const pending = await getPendingTickets(now);
    assert(pending.every((t) => !t.called), 'pendente marcada como chamada');
    const status = await getQueueStatus(now);
    assert(status.history.every((t) => t.called), 'histórico deve conter apenas chamadas');
    assert(new Set(status.history.map((t) => t.id)).size === status.history.length, 'histórico com senha repetida');
  });

  await check('repetição da última chamada reaproveita a senha', async () => {
    const before = await getQueueStatus(now);
    const repeat = await repeatLastCall(now);
    assert(repeat !== null, 'nenhuma chamada anterior para repetir');
    assert(repeat?.isRepeat === true, 'isRepeat deveria ser true');
    if (before.lastCalled && repeat) {
      assert(repeat.id === before.lastCalled.id, 'repetição deveria referenciar a mesma senha');
    }
    const after = await getQueueStatus(now);
    assert(after.history[0]?.id === repeat?.id, 'histórico deveria refletir a repetição');
    assert(after.history[0]?.isRepeat === true, 'última entrada do histórico deveria ser repetição');
  });

  await check('histórico das últimas chamadas limitado a 10 e mais recente primeiro', async () => {
    for (let i = 0; i < 12; i += 1) {
      await generateTicket('btn-2', day2); // N002..N013 no dia 2
    }
    let lastCall = null as Awaited<ReturnType<typeof callNextTicket>>;
    for (let i = 0; i < 12; i += 1) {
      lastCall = await callNextTicket(1, day2);
    }
    const status = await getQueueStatus(day2);
    assert(status.history.length === 10, `histórico=${status.history.length}`);
    assert(lastCall && status.history[0]?.id === lastCall.id, 'entrada mais recente deveria ser a 12ª chamada');
    assert(new Set(status.history.map((t) => t.id)).size === 10, 'histórico deveria conter 10 senhas distintas');
  });

  await check('reset de fila esvazia pendentes e histórico do dia, preservando outros dias', async () => {
    const beforeHistoryDay1 = (await getQueueStatus(now)).history.length;
    await resetQueue(day2);
    const afterPending = await getPendingTickets(day2);
    const afterHistory = (await getQueueStatus(day2)).history;
    const untouchedDay1 = (await getQueueStatus(now)).history.length;
    assert(afterPending.length === 0, 'pendentes deveriam ser zerados');
    assert(afterHistory.length === 0, 'histórico do dia resetado deveria ser vazio');
    assert(untouchedDay1 === beforeHistoryDay1, 'histórico de outro dia foi alterado');
    const ticket = await generateTicket('btn-2', day2);
    assert(ticket.displayNumber === 1, `numeração não reiniciou após reset: ${ticket.displayNumber}`);
  });

  await check('reset de sequência reinicia a numeração do dia', async () => {
    const day3Date = getBusinessDate(day3);
    const t1 = await generateTicket('btn-2', day3);
    const t2 = await generateTicket('btn-2', day3);
    assert(t1.displayNumber === 1 && t2.displayNumber === 2, 'pré-condição de numeração');
    await resetSequenceCounters(day3);
    const t3 = await generateTicket('btn-2', day3);
    assert(t3.displayNumber === 1, `displayNumber após reset de sequência=${t3.displayNumber}`);
    const seq = getDb()
      .prepare('SELECT last_number FROM daily_sequences WHERE business_date = ? AND ticket_type_id = ?')
      .get(day3Date, 'btn-2') as { last_number: number };
    assert(seq.last_number === 1, `sequência persistida=${seq.last_number}`);
  });

  await check('configurações: atualização substitui URLs, edita botões e faz soft-delete', async () => {
    const updated = cloneSettings(originalSettings);
    updated.totalCounters = 7;
    updated.youtubeUrls = ['https://www.youtube.com/watch?v=novo'];
    updated.buttons = [
      { ...updated.buttons[0], name: 'Preferencial VIP', color: '#111111' },
      { id: 'btn-3', name: 'Exame', prefix: 'E', priority: 0, frequency: 1, automaticNumbering: false, startNumber: 100, color: '#222222', textColor: '#FFFFFF' },
    ];
    const saved = await updateSettings(updated);
    assert(saved.totalCounters === 7, 'totalCounters');
    assert(saved.youtubeUrls.length === 1 && saved.youtubeUrls[0].endsWith('novo'), 'youtubeUrls');
    assert(saved.buttons.length === 2, `buttons ativos=${saved.buttons.length}`);
    assert(!saved.buttons.some((b) => b.id === 'btn-2'), 'btn-2 deveria sumir da config ativa');
    assert(saved.buttons[0].name === 'Preferencial VIP', 'edição de botão');
    assert(saved.buttons[1].startNumber === 100, 'novo botão com startNumber 100');

    const exameTicket = await generateTicket('btn-3', day2);
    assert(exameTicket.displayNumber === 100, `startNumber não respeitado: ${exameTicket.displayNumber}`);

    const raw = getDb().prepare('SELECT active FROM ticket_types WHERE id = ?').get('btn-2') as { active: number };
    assert(raw.active === 0, 'btn-2 deveria estar soft-deleted');

    await updateSettings(cloneSettings(DEFAULT_SETTINGS));
    const restored = await getSettings();
    assert(restored.buttons.length === 2, 'defaults não restaurados');
    assert(restored.youtubeUrls.length === 2, 'urls padrão não restauradas');
  });

  await check('relatórios preservam o formato do dashboard', async () => {
    const stats = await getDashboardStats({ from: now, to: now }, now);
    assert(typeof stats.totalIssued === 'number', 'totalIssued');
    assert(typeof stats.totalCalled === 'number', 'totalCalled');
    assert(typeof stats.waitingCount === 'number', 'waitingCount');
    assert(typeof stats.averageServiceTime === 'string', 'averageServiceTime');
    assert(typeof stats.estimatedWaitTime === 'string', 'estimatedWaitTime');
    assert(Array.isArray(stats.ticketsByType), 'ticketsByType');
    assert(Array.isArray(stats.ticketsByCounter), 'ticketsByCounter');
    assert(stats.ticketsByType.length === 2, 'ticketsByType deveria listar os 2 tipos ativos');
    assert(stats.totalIssued >= 1, `totalIssued=${stats.totalIssued}`);
    assert(stats.totalCalled >= 1, `totalCalled=${stats.totalCalled}`);
    for (const entry of stats.ticketsByCounter) {
      assert(entry.counter.startsWith('Guichê '), `rótulo de guichê inesperado: ${entry.counter}`);
    }
  });

  await check('rollback de transação com falha não persiste sequência nem senha', async () => {
    const db = getDb();
    await updateSettings({
      ...cloneSettings(DEFAULT_SETTINGS),
      buttons: [
        ...DEFAULT_SETTINGS.buttons,
        { id: 'btn-fail', name: 'Falha', prefix: 'FAIL', priority: 3, frequency: 1, automaticNumbering: true, startNumber: 1, color: '#000000', textColor: '#FFFFFF' },
      ],
    });
    db.exec(
      `CREATE TRIGGER abort_fail_ticket BEFORE INSERT ON tickets
       WHEN NEW.prefix = 'FAIL' BEGIN SELECT RAISE(ABORT, 'falha proposital'); END`
    );
    const before = db.prepare('SELECT COUNT(*) AS c FROM tickets').get() as { c: number };
    let threw = false;
    try {
      await generateTicket('btn-fail', now);
    } catch {
      threw = true;
    }
    assert(threw, 'emissão deveria ter falhado pelo trigger');
    const after = db.prepare('SELECT COUNT(*) AS c FROM tickets').get() as { c: number };
    assert(after.c === before.c, 'senha deveria ter sido revertida');
    const seq = db
      .prepare('SELECT last_number FROM daily_sequences WHERE business_date = ? AND ticket_type_id = ?')
      .get(getBusinessDate(now), 'btn-fail') as { last_number: number } | undefined;
    assert(!seq || seq.last_number === 0, 'sequência deveria ter sido revertida');
    db.exec('DROP TRIGGER abort_fail_ticket');
    await updateSettings(cloneSettings(DEFAULT_SETTINGS));
  });

  await check('persistência após fechar e reabrir a conexão', async () => {
    const before = await getPendingTickets(now);
    closeDb();
    const after = await getPendingTickets(now);
    assert(after.length === before.length, `antes=${before.length} depois=${after.length}`);
    assert(
      JSON.stringify(after.map((t) => t.id)) === JSON.stringify(before.map((t) => t.id)),
      'senhas mudaram após reabrir conexão'
    );
  });

  // --- Bloco de concorrência entre processos (bancos separados) ---

  const dbEmit = path.join(tmpDir, 'concurrent-emit.db');
  const dbCall = path.join(tmpDir, 'concurrent-call.db');
  const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const self = path.join(process.cwd(), 'scripts', 'db-service-test.ts');

  const runWorker = (dbFile: string, mode: 'emit' | 'call'): Promise<number> =>
    new Promise((resolve, reject) => {
      const child = spawn(tsxBin, [self], {
        env: { ...process.env, SQLITE_PATH: dbFile, FILAFACIL_TEST_WORKER: mode },
        stdio: 'ignore',
      });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    });

  await check('emissões concorrentes entre processos não duplicam números', async () => {
    const codes = await Promise.all([
      runWorker(dbEmit, 'emit'),
      runWorker(dbEmit, 'emit'),
      runWorker(dbEmit, 'emit'),
    ]);
    assert(codes.every((code) => code === 0), `workers falharam: ${codes.join(',')}`);
    const db = new Database(dbEmit, { readonly: true });
    const rows = db
      .prepare('SELECT display_number FROM tickets WHERE ticket_type_id = ? ORDER BY display_number')
      .all('btn-2') as { display_number: number }[];
    db.close();
    assert(rows.length === 30, `esperadas 30 senhas, obtidas ${rows.length}`);
    const unique = new Set(rows.map((r) => r.display_number));
    assert(unique.size === 30, `números duplicados detectados (${unique.size} únicos)`);
  });

  await check('dois operadores chamando em processos diferentes não pegam a mesma senha', async () => {
    process.env.SQLITE_PATH = dbCall;
    closeDb();
    for (let i = 0; i < 12; i += 1) {
      await generateTicket('btn-2');
    }
    const codes = await Promise.all([runWorker(dbCall, 'call'), runWorker(dbCall, 'call')]);
    assert(codes.every((code) => code === 0), `workers falharam: ${codes.join(',')}`);
    const db = new Database(dbCall, { readonly: true });
    const called = db.prepare('SELECT COUNT(*) AS c FROM tickets WHERE called = 1').get() as { c: number };
    const distinctHistory = db
      .prepare('SELECT COUNT(DISTINCT ticket_id) AS c FROM call_history')
      .get() as { c: number };
    const historyCount = db.prepare('SELECT COUNT(*) AS c FROM call_history').get() as { c: number };
    db.close();
    process.env.SQLITE_PATH = path.join(tmpDir, 'service.db');
    closeDb();
    assert(called.c === 10, `senhas chamadas=${called.c} (esperado 10)`);
    assert(historyCount.c === 10, `histórico=${historyCount.c} (esperado 10)`);
    assert(distinctHistory.c === 10, `senhas distintas no histórico=${distinctHistory.c} (esperado 10)`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} testes de serviço passaram.`);

  closeDb();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Erro fatal nos testes de serviço:', error);
  closeDb();
  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // diretório temporário pode não existir
  }
  process.exit(1);
});
