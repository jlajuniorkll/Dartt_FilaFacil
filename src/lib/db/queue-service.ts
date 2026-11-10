import { randomBytes } from 'node:crypto';
import type { AppSettings, ButtonConfig, DashboardStats, Ticket } from '../types';
import type { DateRange } from 'react-day-picker';
import { getDb, type SqliteDatabase } from './connection';
import { initializeDatabase } from './init';
import { getBusinessDate, nowIso } from './time';

// Server-only SQLite implementation of the FilaFácil data contracts.
// Not wired to the UI yet (see Fase 2B). Do not import from client components.
if (typeof window !== 'undefined') {
  throw new Error('src/lib/db/queue-service.ts is server-side only.');
}

const globalForInit = globalThis as unknown as { __filafacilInitFor?: string };

function ready(): void {
  const path = process.env.SQLITE_PATH?.trim() || '';
  if (globalForInit.__filafacilInitFor === path) return;
  initializeDatabase();
  globalForInit.__filafacilInitFor = path;
}

export function getInitialSequenceValue(button: ButtonConfig): number {
  return button.automaticNumbering ? 0 : (button.startNumber ?? 1) - 1;
}

// --- Mappers ---

type TicketRow = {
  id: string;
  business_date: string;
  ticket_number: string;
  ticket_type_id: string;
  prefix: string;
  display_number: number;
  issued_at: string;
  called: number;
  called_at: string | null;
  counter: number | null;
};

function mapTicketRow(row: TicketRow): Ticket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    type: row.ticket_type_id,
    prefix: row.prefix,
    timestamp: row.issued_at,
    called: row.called === 1,
    calledAt: row.called_at ?? undefined,
    displayNumber: row.display_number,
    counter: row.counter ?? undefined,
  };
}

type TicketTypeRow = {
  id: string;
  name: string;
  prefix: string;
  priority: number;
  frequency: number;
  automatic_numbering: number;
  start_number: number | null;
  color: string;
  text_color: string;
  associated_counters: string | null;
  sort_order: number;
};

function mapTicketTypeRow(row: TicketTypeRow): ButtonConfig {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    priority: row.priority,
    frequency: row.frequency,
    automaticNumbering: row.automatic_numbering === 1,
    startNumber: row.start_number ?? undefined,
    color: row.color,
    textColor: row.text_color,
    associatedCounters: row.associated_counters ?? undefined,
  };
}

function readSettings(db: SqliteDatabase): AppSettings {
  const settingsRow = db
    .prepare(
      'SELECT priority_enabled, counter_configuration, total_counters FROM settings WHERE id = 1'
    )
    .get() as
    | { priority_enabled: number; counter_configuration: string; total_counters: number }
    | undefined;

  const typeRows = db
    .prepare(
      `SELECT id, name, prefix, priority, frequency, automatic_numbering, start_number,
              color, text_color, associated_counters, sort_order
       FROM ticket_types
       WHERE active = 1
       ORDER BY sort_order ASC, id ASC`
    )
    .all() as TicketTypeRow[];

  const urlRows = db
    .prepare('SELECT url FROM youtube_urls WHERE settings_id = 1 ORDER BY position ASC')
    .all() as { url: string }[];

  return {
    buttons: typeRows.map(mapTicketTypeRow),
    youtubeUrls: urlRows.map((row) => row.url),
    priorityEnabled: settingsRow ? settingsRow.priority_enabled === 1 : true,
    counterConfiguration: 'none',
    totalCounters: settingsRow?.total_counters ?? 5,
  };
}

function fetchPendingTickets(db: SqliteDatabase, businessDate: string): Ticket[] {
  const rows = db
    .prepare(
      `SELECT id, business_date, ticket_number, ticket_type_id, prefix, display_number,
              issued_at, called, called_at, counter
       FROM tickets
       WHERE business_date = ? AND called = 0
       ORDER BY issued_at ASC, id ASC`
    )
    .all(businessDate) as TicketRow[];
  return rows.map(mapTicketRow);
}

function markTicketCalledInTransaction(
  db: SqliteDatabase,
  ticketId: string,
  businessDate: string,
  counter: number | undefined,
  calledAt: string,
  isRepeat: boolean
): Ticket {
  if (!isRepeat) {
    const result = db
      .prepare('UPDATE tickets SET called = 1, called_at = ?, counter = ? WHERE id = ? AND called = 0')
      .run(calledAt, counter ?? null, ticketId);
    if (result.changes !== 1) {
      throw new Error('Ticket already called or not found.');
    }
  }

  db.prepare(
    `INSERT INTO call_history (business_date, ticket_id, called_at, counter, is_repeat)
     VALUES (?, ?, ?, ?, ?)`
  ).run(businessDate, ticketId, calledAt, counter ?? null, isRepeat ? 1 : 0);

  const row = db
    .prepare(
      `SELECT id, business_date, ticket_number, ticket_type_id, prefix, display_number,
              issued_at, called, called_at, counter
       FROM tickets WHERE id = ?`
    )
    .get(ticketId) as TicketRow;

  return {
    ...mapTicketRow(row),
    called: true,
    calledAt,
    isRepeat,
    counter: counter ?? undefined,
  };
}

type CallHistoryJoinRow = TicketRow & {
  history_called_at: string;
  history_counter: number | null;
  history_is_repeat: number;
};

function mapHistoryRow(row: CallHistoryJoinRow): Ticket {
  return {
    ...mapTicketRow(row),
    called: true,
    calledAt: row.history_called_at,
    counter: row.history_counter ?? undefined,
    isRepeat: row.history_is_repeat === 1,
  };
}

function selectHistory(db: SqliteDatabase, businessDate: string, limit: number): Ticket[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.business_date, t.ticket_number, t.ticket_type_id, t.prefix, t.display_number,
              t.issued_at, t.called, t.called_at, t.counter,
              h.called_at AS history_called_at,
              h.counter AS history_counter,
              h.is_repeat AS history_is_repeat
       FROM call_history h
       JOIN tickets t ON t.id = h.ticket_id
       WHERE h.business_date = ?
       ORDER BY h.id DESC
       LIMIT ?`
    )
    .all(businessDate, limit) as CallHistoryJoinRow[];
  return rows.map(mapHistoryRow);
}

function readPriorityCounters(
  db: SqliteDatabase,
  businessDate: string,
  buttons: ButtonConfig[]
): Record<string, number> {
  const rows = db
    .prepare(
      'SELECT ticket_type_id, call_count FROM priority_call_counters WHERE business_date = ?'
    )
    .all(businessDate) as { ticket_type_id: string; call_count: number }[];
  const stored = new Map(rows.map((row) => [row.ticket_type_id, row.call_count]));
  const counters: Record<string, number> = {};
  for (const button of buttons) {
    counters[button.id] = stored.get(button.id) ?? 0;
  }
  return counters;
}

function writePriorityCounters(
  db: SqliteDatabase,
  businessDate: string,
  counters: Record<string, number>,
  buttons: ButtonConfig[]
): void {
  const upsert = db.prepare(
    `INSERT INTO priority_call_counters (business_date, ticket_type_id, call_count)
     VALUES (?, ?, ?)
     ON CONFLICT (business_date, ticket_type_id)
     DO UPDATE SET call_count = excluded.call_count`
  );
  for (const button of buttons) {
    upsert.run(businessDate, button.id, counters[button.id] ?? 0);
  }
}

// --- Settings ---

export async function getSettings(): Promise<AppSettings> {
  ready();
  return readSettings(getDb());
}

export async function updateSettings(newSettings: AppSettings): Promise<AppSettings> {
  ready();
  const db = getDb();
  const ts = nowIso();

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO settings (id, priority_enabled, counter_configuration, total_counters, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         priority_enabled = excluded.priority_enabled,
         counter_configuration = excluded.counter_configuration,
         total_counters = excluded.total_counters,
         updated_at = excluded.updated_at`
    ).run(
      newSettings.priorityEnabled ? 1 : 0,
      newSettings.counterConfiguration ?? 'none',
      Math.max(0, Math.trunc(newSettings.totalCounters ?? 0)),
      ts,
      ts
    );

    db.prepare('DELETE FROM youtube_urls WHERE settings_id = 1').run();
    const insertUrl = db.prepare(
      'INSERT INTO youtube_urls (settings_id, position, url) VALUES (1, ?, ?)'
    );
    newSettings.youtubeUrls.forEach((url, index) => {
      insertUrl.run(index, url);
    });

    const provided = new Set(newSettings.buttons.map((button) => button.id));

    const upsertType = db.prepare(
      `INSERT INTO ticket_types
         (id, name, prefix, priority, frequency, automatic_numbering, start_number,
          color, text_color, associated_counters, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         prefix = excluded.prefix,
         priority = excluded.priority,
         frequency = excluded.frequency,
         automatic_numbering = excluded.automatic_numbering,
         start_number = excluded.start_number,
         color = excluded.color,
         text_color = excluded.text_color,
         associated_counters = excluded.associated_counters,
         sort_order = excluded.sort_order,
         active = 1,
         updated_at = excluded.updated_at`
    );

    newSettings.buttons.forEach((button, index) => {
      upsertType.run(
        button.id,
        button.name,
        button.prefix,
        button.priority,
        Math.max(1, Math.trunc(button.frequency ?? 1)),
        button.automaticNumbering ? 1 : 0,
        button.startNumber ?? null,
        button.color,
        button.textColor,
        button.associatedCounters ?? null,
        index + 1,
        ts,
        ts
      );
    });

    // Buttons missing from the new list are soft-deleted so historical
    // tickets keep a valid FK reference.
    const deactivate = db.prepare(
      'UPDATE ticket_types SET active = 0, updated_at = ? WHERE active = 1 AND id = ?'
    );
    const existing = db.prepare('SELECT id FROM ticket_types WHERE active = 1').all() as {
      id: string;
    }[];
    for (const row of existing) {
      if (!provided.has(row.id)) deactivate.run(ts, row.id);
    }
  });

  run.immediate();
  return readSettings(db);
}

// --- Tickets ---

export async function generateTicket(
  buttonId: string,
  referenceDate?: Date
): Promise<Ticket> {
  ready();
  const db = getDb();
  const settings = readSettings(db);
  const button = settings.buttons.find((candidate) => candidate.id === buttonId);
  if (!button) {
    throw new Error('Button configuration not found');
  }

  const businessDate = getBusinessDate(referenceDate);
  const ts = nowIso();

  const run = db.transaction(() => {
    const sequenceRow = db
      .prepare(
        'SELECT last_number FROM daily_sequences WHERE business_date = ? AND ticket_type_id = ?'
      )
      .get(businessDate, button.id) as { last_number: number } | undefined;

    const initial = getInitialSequenceValue(button);
    let current = sequenceRow?.last_number ?? initial;

    if (!button.automaticNumbering && button.startNumber != null) {
      if (current < button.startNumber - 1) {
        current = button.startNumber - 1;
      }
    } else if (button.automaticNumbering) {
      current = current ?? 0;
    }

    const newNumber = current + 1;

    db.prepare(
      `INSERT INTO daily_sequences (business_date, ticket_type_id, last_number, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (business_date, ticket_type_id)
       DO UPDATE SET last_number = excluded.last_number, updated_at = excluded.updated_at`
    ).run(businessDate, button.id, newNumber, ts);

    const id = `ticket-${Date.now()}-${button.prefix}-${randomBytes(4).toString('hex')}`;
    const ticketNumber = `${button.prefix}${String(newNumber).padStart(3, '0')}`;

    db.prepare(
      `INSERT INTO tickets
         (id, business_date, ticket_number, ticket_type_id, prefix, display_number, issued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, businessDate, ticketNumber, button.id, button.prefix, newNumber, ts);

    return {
      id,
      ticketNumber,
      type: button.id,
      prefix: button.prefix,
      timestamp: ts,
      called: false,
      displayNumber: newNumber,
    } as Ticket;
  });

  return run.immediate();
}

export async function getPendingTickets(referenceDate?: Date): Promise<Ticket[]> {
  ready();
  const businessDate = getBusinessDate(referenceDate);
  return fetchPendingTickets(getDb(), businessDate);
}

export async function getQueueStatus(
  referenceDate?: Date
): Promise<{ lastCalled: Ticket | null; history: Ticket[]; videos: string[] }> {
  ready();
  const db = getDb();
  const settings = readSettings(db);
  const businessDate = getBusinessDate(referenceDate);
  const history = selectHistory(db, businessDate, 10);
  return {
    lastCalled: history.length > 0 ? history[0] : null,
    history,
    videos: settings.youtubeUrls,
  };
}

export async function callNextTicket(
  counter: number,
  referenceDate?: Date
): Promise<Ticket | null> {
  ready();
  const db = getDb();
  const settings = readSettings(db);
  const businessDate = getBusinessDate(referenceDate);

  const run = db.transaction(() => {
    const pending = fetchPendingTickets(db, businessDate);
    if (pending.length === 0) return null;

    let chosen: Ticket | undefined;

    if (settings.priorityEnabled) {
      const sortedButtons = [...settings.buttons].sort((a, b) => a.priority - b.priority);
      const counters = readPriorityCounters(db, businessDate, settings.buttons);
      const newCounters = { ...counters };

      for (const button of sortedButtons) {
        const callCount = newCounters[button.id] ?? 0;
        if (callCount < button.frequency) {
          const eligible = pending.find((ticket) => ticket.type === button.id);
          if (eligible) {
            chosen = eligible;
            newCounters[button.id] = callCount + 1;
            break;
          }
        }
      }

      if (!chosen) {
        for (const key of Object.keys(newCounters)) newCounters[key] = 0;
        for (const button of sortedButtons) {
          const eligible = pending.find((ticket) => ticket.type === button.id);
          if (eligible) {
            chosen = eligible;
            newCounters[button.id] = 1;
            break;
          }
        }
      }

      if (!chosen && pending.length > 0) {
        chosen = pending[0];
      }

      writePriorityCounters(db, businessDate, newCounters, settings.buttons);
    } else {
      chosen = pending[0];
    }

    if (!chosen) return null;
    return markTicketCalledInTransaction(db, chosen.id, businessDate, counter, nowIso(), false);
  });

  return run.immediate();
}

export async function callNextTicketByType(
  buttonId: string,
  counter: number,
  referenceDate?: Date
): Promise<Ticket | null> {
  ready();
  const db = getDb();
  const businessDate = getBusinessDate(referenceDate);

  const run = db.transaction(() => {
    const pending = fetchPendingTickets(db, businessDate);
    const chosen = pending.find((ticket) => ticket.type === buttonId);
    if (!chosen) return null;
    return markTicketCalledInTransaction(db, chosen.id, businessDate, counter, nowIso(), false);
  });

  return run.immediate();
}

export async function repeatLastCall(referenceDate?: Date): Promise<Ticket | null> {
  ready();
  const db = getDb();
  const businessDate = getBusinessDate(referenceDate);

  const run = db.transaction(() => {
    const lastCall = db
      .prepare(
        `SELECT t.id, t.business_date, t.ticket_number, t.ticket_type_id, t.prefix, t.display_number,
                t.issued_at, t.called, t.called_at, t.counter,
                h.called_at AS history_called_at,
                h.counter AS history_counter,
                h.is_repeat AS history_is_repeat
         FROM call_history h
         JOIN tickets t ON t.id = h.ticket_id
         WHERE h.business_date = ?
         ORDER BY h.id DESC
         LIMIT 1`
      )
      .get(businessDate) as CallHistoryJoinRow | undefined;
    if (!lastCall) return null;

    const calledAt = nowIso();
    db.prepare(
      `INSERT INTO call_history (business_date, ticket_id, called_at, counter, is_repeat)
       VALUES (?, ?, ?, ?, 1)`
    ).run(businessDate, lastCall.id, calledAt, lastCall.history_counter);

    return {
      ...mapTicketRow(lastCall),
      called: true,
      calledAt,
      isRepeat: true,
      counter: lastCall.history_counter ?? undefined,
    };
  });

  return run.immediate();
}

// --- Reset ---

export async function resetQueue(referenceDate?: Date): Promise<void> {
  ready();
  const db = getDb();
  const settings = readSettings(db);
  const businessDate = getBusinessDate(referenceDate);
  const ts = nowIso();

  const run = db.transaction(() => {
    // Firebase parity: deletes the current business day's tickets and the
    // day's call history. History from previous days is preserved.
    db.prepare('DELETE FROM call_history WHERE business_date = ?').run(businessDate);
    db.prepare('DELETE FROM tickets WHERE business_date = ?').run(businessDate);

    const upsertSequence = db.prepare(
      `INSERT INTO daily_sequences (business_date, ticket_type_id, last_number, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (business_date, ticket_type_id)
       DO UPDATE SET last_number = excluded.last_number, updated_at = excluded.updated_at`
    );
    for (const button of settings.buttons) {
      upsertSequence.run(businessDate, button.id, getInitialSequenceValue(button), ts);
    }

    // Missing rows are treated as 0 everywhere (same as Firebase default).
    db.prepare('DELETE FROM priority_call_counters WHERE business_date = ?').run(businessDate);
  });

  run.immediate();
}

export async function resetSequenceCounters(referenceDate?: Date): Promise<void> {
  ready();
  const db = getDb();
  const settings = readSettings(db);
  const businessDate = getBusinessDate(referenceDate);
  const ts = nowIso();

  const upsertSequence = db.prepare(
    `INSERT INTO daily_sequences (business_date, ticket_type_id, last_number, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (business_date, ticket_type_id)
     DO UPDATE SET last_number = excluded.last_number, updated_at = excluded.updated_at`
  );
  const run = db.transaction(() => {
    for (const button of settings.buttons) {
      upsertSequence.run(businessDate, button.id, getInitialSequenceValue(button), ts);
    }
  });
  run.immediate();
}

// --- Dashboard ---

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function formatDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
  if (totalSeconds === 0) return '0s';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  let result = '';
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m `;
  if (seconds > 0 || result === '') result += `${seconds}s`;

  return result.trim();
}

function differenceInSeconds(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 1000);
}

export async function getDashboardStats(
  dateRange: DateRange,
  referenceDate?: Date
): Promise<DashboardStats> {
  ready();
  const db = getDb();
  const settings = readSettings(db);

  let periodTickets: Ticket[] = [];
  if (dateRange.from) {
    const startDate = getBusinessDate(dateRange.from);
    const endAnchor = dateRange.to ?? dateRange.from;
    const endDate = getBusinessDate(endAnchor);

    if (startDate <= endDate) {
      const rows = db
        .prepare(
          `SELECT id, business_date, ticket_number, ticket_type_id, prefix, display_number,
                  issued_at, called, called_at, counter
           FROM tickets
           WHERE business_date >= ? AND business_date <= ?
           ORDER BY issued_at ASC`
        )
        .all(startDate, endDate) as TicketRow[];
      periodTickets = rows.map(mapTicketRow);
    }
  }

  const calledTickets = periodTickets.filter((ticket) => ticket.called && ticket.calledAt);

  let totalServiceSeconds = 0;
  for (const ticket of calledTickets) {
    if (ticket.calledAt) {
      totalServiceSeconds += differenceInSeconds(
        new Date(ticket.calledAt),
        new Date(ticket.timestamp)
      );
    }
  }
  const averageServiceTimeInSeconds =
    calledTickets.length > 0 ? totalServiceSeconds / calledTickets.length : 0;

  const ticketsByType = settings.buttons.map((button) => ({
    name: button.name,
    count: periodTickets.filter((ticket) => ticket.type === button.id).length,
    fill: button.color,
  }));

  const calledByCounterMap: { [key: number]: number } = {};
  for (const ticket of calledTickets) {
    if (ticket.counter) {
      calledByCounterMap[ticket.counter] = (calledByCounterMap[ticket.counter] || 0) + 1;
    }
  }

  const ticketsByCounter = Object.entries(calledByCounterMap)
    .map(([counter, count], index) => ({
      counter: `Guichê ${counter}`,
      count,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }))
    .sort((a, b) => a.counter.localeCompare(b.counter));

  const waitingTickets = await getPendingTickets(referenceDate);

  const todayBusinessDate = getBusinessDate(referenceDate);
  const todaysCalledTickets = calledTickets.filter(
    (ticket) => ticket.calledAt && getBusinessDate(new Date(ticket.timestamp)) === todayBusinessDate
  );

  let totalServiceSecondsToday = 0;
  for (const ticket of todaysCalledTickets) {
    if (ticket.calledAt) {
      totalServiceSecondsToday += differenceInSeconds(
        new Date(ticket.calledAt),
        new Date(ticket.timestamp)
      );
    }
  }
  const averageServiceTimeToday =
    todaysCalledTickets.length > 0 ? totalServiceSecondsToday / todaysCalledTickets.length : 0;
  const estimatedWaitSeconds = averageServiceTimeToday * waitingTickets.length;

  return {
    totalIssued: periodTickets.length,
    totalCalled: calledTickets.length,
    waitingCount: waitingTickets.length,
    averageServiceTime: formatDuration(averageServiceTimeInSeconds),
    estimatedWaitTime: formatDuration(estimatedWaitSeconds),
    ticketsByType,
    ticketsByCounter,
  };
}
