// Self-contained first-admin bootstrap for the production container.
// Usage (inside the container, with a TTY):
//   docker exec -it <filafacil-app> node scripts/create-admin.mjs
// Creates the FIRST user only when the users table is empty. Never stores the
// password anywhere except as an Argon2id hash inside /data/filafacil.db.

import readline from 'node:readline';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from '@node-rs/argon2';
import Database from 'better-sqlite3';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Este procedimento exige um terminal interativo (TTY).');
  console.error('Use docker exec -it para criar o primeiro administrador.');
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
  console.log('FilaFácil — criação do primeiro administrador (manual)');
  console.log(`Banco: ${dbPath}\n`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  const usersCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (usersCount > 0) {
    throw new Error('Bootstrap recusado: já existem usuários cadastrados.');
  }

  const email = await ask('E-mail do administrador: ');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
    throw new Error('E-mail inválido.');
  }

  const password = await ask('Senha (mín. 12 caracteres, letras e números): ', true);
  const strengthError = validatePasswordStrength(password);
  if (strengthError) throw new Error(strengthError);

  const confirmation = await ask('Confirme a senha: ', true);
  if (password !== confirmation) throw new Error('As senhas não coincidem.');

  close();

  const hash = await argon2.hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const ts = new Date().toISOString();
  const id = randomUUID();
  const normalizedEmail = email.trim().toLowerCase();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, role, password_hash, created_at, updated_at)
       VALUES (?, ?, 'admin', ?, ?, ?)`
    ).run(id, normalizedEmail, hash, ts, ts);
  });
  insert.immediate();
  db.close();

  console.log(`\nPrimeiro administrador criado: ${normalizedEmail}`);
  console.log('A senha não foi exibida nem registrada em logs.');
  console.log('Guarde-a com segurança. Este procedimento não pode ser repetido enquanto houver usuários.');
}

main().catch((error) => {
  close();
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
