// Self-contained password reset for an existing local user.
// Usage (inside the container, with a TTY):
//   docker exec -it <filafacil-app> node scripts/reset-password.mjs
// Resets the password of the given user and revokes all their sessions.

import readline from 'node:readline';
import argon2 from '@node-rs/argon2';
import Database from 'better-sqlite3';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Este procedimento exige um terminal interativo (TTY).');
  console.error('Use docker exec -it para redefinir a senha.');
  process.exit(1);
}

const dbPath = process.env.SQLITE_PATH || '/data/filafacil.db';
const PASSWORD_MIN_LENGTH = 12;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const originalWrite = rl._writeToOutput.bind(rl);
rl._writeToOutput = (chunk) => {
  if (muted) {
    if (chunk.includes('\n') || chunk.includes('\r')) originalWrite('\n');
    return;
  }
  originalWrite(chunk);
};
const queue = [];
let waiter = null;
rl.on('line', (line) => {
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(line);
  } else {
    queue.push(line);
  }
});
const ask = (query, hidden = false) => {
  muted = hidden;
  process.stdout.write(query);
  return new Promise((resolve) => {
    const queued = queue.shift();
    if (queued !== undefined) resolve(queued.trim());
    else waiter = resolve;
  }).finally(() => {
    muted = false;
  });
};
const close = () => rl.close();

function validatePasswordStrength(password) {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'A senha deve conter letras e números.';
  return null;
}

async function main() {
  console.log('FilaFácil — redefinição de senha (manual)');
  console.log(`Banco: ${dbPath}\n`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  const email = await ask('E-mail do usuário: ');
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(normalizedEmail);
  if (!user) throw new Error('Usuário não encontrado.');

  const password = await ask('Nova senha (mín. 12 caracteres, letras e números): ', true);
  const strengthError = validatePasswordStrength(password);
  if (strengthError) throw new Error(strengthError);

  const confirmation = await ask('Confirme a nova senha: ', true);
  if (password !== confirmation) throw new Error('As senhas não coincidem.');

  close();

  const hash = await argon2.hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const ts = new Date().toISOString();

  const reset = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, ts, user.id);
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(ts, user.id);
  });
  reset.immediate();
  db.close();

  console.log(`\nSenha redefinida para ${normalizedEmail}. Todas as sessões do usuário foram revogadas.`);
}

main().catch((error) => {
  close();
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
