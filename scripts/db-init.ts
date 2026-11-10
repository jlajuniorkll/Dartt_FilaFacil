import { initializeDatabase } from '../src/lib/db/init';
import { getSqlitePath, closeDb } from '../src/lib/db/connection';

const dbPath = getSqlitePath();
console.log(`Inicializando banco SQLite em: ${dbPath}`);

const result = initializeDatabase();
console.log('Migrações aplicadas:', result.migrationsApplied.length > 0 ? result.migrationsApplied : '(nenhuma, banco já atualizado)');
console.log('Versão atual do schema:', result.currentVersion);
console.log('Dados iniciais processados:', result.seeded.length > 0 ? result.seeded : '(nenhum, já existente)');

closeDb();
