// Manual, interactive password reset for an existing local user.
// Usage: npm run auth:reset-password
// Part of the Firebase migration path: original Firebase passwords cannot be
// exported in plain text, so migrated users must set a new password here.

import {
  findUserByEmail,
  validatePasswordStrength,
  resetUserPassword,
} from '../src/lib/db/auth-service';
import { createPrompt } from './lib/prompt';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Este procedimento exige um terminal interativo (TTY).');
  console.error('Execute `npm run auth:reset-password` diretamente — a senha nunca deve ser canalizada por pipes.');
  process.exit(1);
}

const prompt = createPrompt();

async function main() {
  console.log('FilaFácil — redefinição de senha (manual)');
  console.log('A senha não será exibida nem registrada em logs.\n');

  const email = await prompt.ask('E-mail do usuário: ');
  const user = findUserByEmail(email);
  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  const password = await prompt.ask('Nova senha (mín. 12 caracteres, letras e números): ', { hidden: true });
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    throw new Error(strengthError);
  }

  const confirmation = await prompt.ask('Confirme a nova senha: ', { hidden: true });
  if (password !== confirmation) {
    throw new Error('As senhas não coincidem.');
  }

  prompt.close();
  await resetUserPassword(user.id, password);
  console.log(`\nSenha redefinida para ${user.email}. Todas as sessões do usuário foram revogadas.`);
}

main().catch((error) => {
  prompt.close();
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
