// Testes da fase 2F — segurança de build e dependências (guards de regressão).
import fs from 'node:fs';
import path from 'node:path';

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

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

const run = async () => {
  await check('build não mascara falhas: sem ignoreBuildErrors/ignoreDuringBuilds', () => {
    const config = read('next.config.ts');
    assert(!config.includes('ignoreBuildErrors'), 'typescript.ignoreBuildErrors presente');
    assert(!config.includes('ignoreDuringBuilds'), 'eslint.ignoreDuringBuilds presente');
    assert(config.includes("output: 'standalone'"), 'output standalone perdido');
    assert(config.includes("serverExternalPackages: ['better-sqlite3']"), 'serverExternalPackages perdido');
  });

  await check('headers de segurança presentes no next.config', () => {
    const config = read('next.config.ts');
    assert(config.includes('X-Content-Type-Options'), 'falta X-Content-Type-Options');
    assert(config.includes('X-Frame-Options'), 'falta X-Frame-Options');
    assert(config.includes('Referrer-Policy'), 'falta Referrer-Policy');
    assert(config.includes('Permissions-Policy'), 'falta Permissions-Policy');
    assert(config.includes('poweredByHeader: false'), 'poweredByHeader não desabilitado');
  });

  await check('piso de segurança do Next.js (>=15.5.29, linha 15)', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      overrides?: Record<string, unknown>;
    };
    const next = pkg.dependencies.next;
    assert(typeof next === 'string', 'next ausente de dependencies');
    const major = Number(next.split('.')[0]);
    const minor = Number(next.split('.')[1]);
    const patch = Number(next.split('.')[2]);
    assert(major === 15, `next major mudou (${next}) — revisar advisories antes de migrar`);
    assert(
      minor > 5 || (minor === 5 && patch >= 29),
      `next ${next} abaixo do piso 15.5.29 (advisories GHSA corrigidos na 2F)`
    );
  });

  await check('React permanece na linha 18 (compat Next 15.5)', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    for (const name of ['react', 'react-dom']) {
      const range = pkg.dependencies[name] ?? '';
      assert(range.includes('18.'), `${name} fora da linha 18: ${range}`);
    }
  });

  await check('correções de segurança aplicadas: jspdf>=4.2.1 e override postcss', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      overrides?: { next?: { postcss?: string } };
    };
    const jspdf = pkg.dependencies.jspdf ?? '';
    const jspdfMajor = Number(jspdf.replace(/[^0-9.]/g, '').split('.')[0]);
    assert(jspdfMajor >= 4, `jspdf ${jspdf} abaixo do fix 4.2.1 (advisories críticos)`);
    const postcssOverride = pkg.overrides?.next?.postcss;
    assert(Boolean(postcssOverride), 'override overrides.next.postcss ausente');
    assert(!postcssOverride!.includes('"'), `override postcss malformado: ${postcssOverride}`);
  });

  await check('zod permanece v3 (migração major documentada, não silenciosa)', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    const zod = (pkg.dependencies.zod ?? '').replace(/^[~^]/, '');
    assert(zod.startsWith('3.'), `zod mudou para ${zod} sem migração documentada`);
  });

  await check('sem flags de servidor de ação que enfraqueçam a proteção same-origin', () => {
    const config = read('next.config.ts');
    assert(!config.includes('serverActions'), 'serverActions configurado — revisar allowedOrigins');
    assert(!config.includes('allowedOrigins'), 'allowedOrigins presente');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} testes da fase 2F passaram.`);
  if (failed.length > 0) process.exit(1);
};

run().catch((error) => {
  console.error('Erro fatal nos testes 2F:', error);
  process.exit(1);
});
