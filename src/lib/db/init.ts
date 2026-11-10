import { getDb } from './connection';
import { runMigrations } from './migrations';
import { nowIso } from './time';

export interface InitializeResult {
  migrationsApplied: string[];
  currentVersion: number;
  seeded: string[];
}

const DEFAULT_PROFILES = [
  { id: 'admin', name: 'Administrador', description: 'Acesso total à administração e configurações.' },
  { id: 'operator', name: 'Operador', description: 'Operação de guichê: chamada, rechamada e painel.' },
] as const;

const DEFAULT_TICKET_TYPES = [
  {
    id: 'btn-1',
    name: 'Preferencial',
    prefix: 'P',
    priority: 1,
    frequency: 2,
    automaticNumbering: 1,
    startNumber: 1,
    color: '#5DADE2',
    textColor: '#FFFFFF',
    sortOrder: 1,
  },
  {
    id: 'btn-2',
    name: 'Normal',
    prefix: 'N',
    priority: 2,
    frequency: 1,
    automaticNumbering: 1,
    startNumber: 1,
    color: '#F39C12',
    textColor: '#FFFFFF',
    sortOrder: 2,
  },
] as const;

const DEFAULT_YOUTUBE_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=3Z1_p7-v7v8',
] as const;

export function initializeDatabase(): InitializeResult {
  const db = getDb();
  const { applied, currentVersion } = runMigrations(db);
  const seeded: string[] = [];

  const seed = db.transaction(() => {
    const insertProfile = db.prepare(
      'INSERT OR IGNORE INTO profiles (id, name, description) VALUES (?, ?, ?)'
    );
    for (const profile of DEFAULT_PROFILES) {
      const result = insertProfile.run(profile.id, profile.name, profile.description);
      if (result.changes > 0) seeded.push(`profile:${profile.id}`);
    }

    const ts = nowIso();

    const insertSettings = db.prepare(
      `INSERT OR IGNORE INTO settings (id, priority_enabled, counter_configuration, total_counters, created_at, updated_at)
       VALUES (1, 1, 'none', 5, ?, ?)`
    );
    if (insertSettings.run(ts, ts).changes > 0) seeded.push('settings:default');

    const insertType = db.prepare(
      `INSERT OR IGNORE INTO ticket_types
         (id, name, prefix, priority, frequency, automatic_numbering, start_number,
          color, text_color, associated_counters, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    );
    for (const type of DEFAULT_TICKET_TYPES) {
      const result = insertType.run(
        type.id,
        type.name,
        type.prefix,
        type.priority,
        type.frequency,
        type.automaticNumbering,
        type.startNumber,
        type.color,
        type.textColor,
        type.sortOrder,
        ts,
        ts
      );
      if (result.changes > 0) seeded.push(`ticket_type:${type.id}`);
    }

    const insertUrl = db.prepare(
      'INSERT OR IGNORE INTO youtube_urls (settings_id, position, url) VALUES (1, ?, ?)'
    );
    DEFAULT_YOUTUBE_URLS.forEach((url, index) => {
      const result = insertUrl.run(index, url);
      if (result.changes > 0) seeded.push(`youtube_url:${index}`);
    });
  });
  seed.immediate();

  return { migrationsApplied: applied, currentVersion, seeded };
}
