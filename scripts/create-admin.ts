// Manual, interactive bootstrap for the FIRST administrator.
// Usage: npm run auth:create-admin
// Never run from CI/automation. Never pass the password as argument or env var.

import { bootstrapFirstAdmin, validatePasswordStrength } from '../src/lib/db/auth-service';
import { createPrompt } from './lib/prompt';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Este procedimento exige um terminal interativo (TTY).');
  console.error('Execute `npm run auth:create-admin` diretamente — a senha nunca deve ser canalizada por pipes.');
  process.exit(1);
}

const prompt = createPrompt();

async function main() {
  console.log('FilaFácil — criação do primeiro administrador (manual)');
  console.log('A senha não será exibida nem registrada em logs.\n');

  const email = await prompt.ask('E-mail do administrador: ');
  if (!email) {
    throw new Error('E-mail não informado.');
  }

  const password = await prompt.ask('Senha (mín. 12 caracteres, letras e números): ', { hidden: true });
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    throw new Error(strengthError);
  }

  const confirmation = await prompt.ask('Confirme a senha: ', { hidden: true });
  if (password !== confirmation) {
    throw new Error('As senhas não coincidem.');
  }

  prompt.close();
  const created = await bootstrapFirstAdmin({ email, password });
  console.log(`\nPrimeiro administrador criado com sucesso (id: ${created.id}, e-mail: ${created.email}).`);
  console.log('Guarde a senha com segurança. Este procedimento não pode ser repetido enquanto houver usuários cadastrados.');
}

main().catch((error) => {
  prompt.close();
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
