// Generates public/voice/<token>.wav from public/voice/manifest.json using espeak-ng.
// Requires espeak-ng installed (https://github.com/espeak-ng/espeak-ng) OR the
// containerized wrapper: docker build -t filafacil-espeak-ng:local - < scripts/voice-espeak.Dockerfile
// Usage: npm run voice:generate
//        ESPEAK_NG_BIN=scripts/espeak-ng-docker.sh npm run voice:generate

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ESPEAK_BIN = process.env.ESPEAK_NG_BIN || 'espeak-ng';
const VOICE_DIR = path.join(process.cwd(), 'public', 'voice');
const MANIFEST_PATH = path.join(VOICE_DIR, 'manifest.json');

const WORD_FOR_TOKEN: Record<string, string> = {
  senha: 'Senha',
  repetindo: 'Repetindo senha',
  guiche: 'Guichê',
  teste: 'Teste de voz do painel de senhas',
  e: 'i', // pt-BR: conjunção = /i/ (espeak lê "e" isolado como /ɛ/)
  cem: 'cem',
  cento: 'cento',
  duzentos: 'duzentos',
  trezentos: 'trezentos',
  quatrocentos: 'quatrocentos',
  quinhentos: 'quinhentos',
  seiscentos: 'seiscentos',
  setecentos: 'setecentos',
  oitocentos: 'oitocentos',
  novecentos: 'novecentos',
  mil: 'mil',
  zero: 'zero',
  um: 'um',
  dois: 'dois',
  tres: 'três',
  quatro: 'quatro',
  cinco: 'cinco',
  seis: 'seis',
  sete: 'sete',
  oito: 'oito',
  nove: 'nove',
  dez: 'dez',
  onze: 'onze',
  doze: 'doze',
  treze: 'treze',
  quatorze: 'catorze',
  quinze: 'quinze',
  dezesseis: 'dezesseis',
  dezessete: 'dezessete',
  dezoito: 'dezoito',
  dezenove: 'dezenove',
  vinte: 'vinte',
  trinta: 'trinta',
  quarenta: 'quarenta',
  cinquenta: 'cinquenta',
  sessenta: 'sessenta',
  setenta: 'setenta',
  oitenta: 'oitenta',
  noventa: 'noventa',
  'letra-a': 'a',
  'letra-b': 'bê',
  'letra-c': 'cê',
  'letra-d': 'dê',
  'letra-e': 'e', // nome da letra E = /ɛ/ ("é" é lido pelo espeak como "é agudo")
  'letra-f': 'éfe',
  'letra-g': 'gê',
  'letra-h': 'agá',
  'letra-i': 'i',
  'letra-j': 'jota',
  'letra-k': 'cá',
  'letra-l': 'éle',
  'letra-m': 'ême',
  'letra-n': 'êne',
  'letra-o': 'ó',
  'letra-p': 'pê',
  'letra-q': 'quê',
  'letra-r': 'érre',
  'letra-s': 'ésse',
  'letra-t': 'tê',
  'letra-u': 'u',
  'letra-v': 'vê',
  'letra-w': 'dáblio',
  'letra-x': 'xis',
  'letra-y': 'ípsilon',
  'letra-z': 'zê',
};

function ensureEspeakNg(): void {
  try {
    execFileSync(ESPEAK_BIN, ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('espeak-ng não encontrado. Opções:');
    console.error('  1) Instale com: sudo apt-get install -y espeak-ng');
    console.error('  2) Container isolado: docker build -t filafacil-espeak-ng:local - < scripts/voice-espeak.Dockerfile');
    console.error('     e rode: ESPEAK_NG_BIN=scripts/espeak-ng-docker.sh npm run voice:generate');
    process.exit(1);
  }
}

function main() {
  ensureEspeakNg();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as { tokens: string[] };

  let generated = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const token of manifest.tokens) {
    const text = WORD_FOR_TOKEN[token];
    if (!text) {
      missing.push(token);
      continue;
    }
    const outFile = path.join(VOICE_DIR, `${token}.wav`);
    execFileSync(ESPEAK_BIN, ['-v', 'pt-br', '-s', '150', '-w', outFile, text], { stdio: 'ignore' });
    generated += 1;
  }

  console.log(`Gerados: ${generated} arquivos. Pulados: ${skipped}.`);
  if (missing.length > 0) {
    console.error(`Tokens sem mapeamento de texto: ${missing.join(', ')}`);
    process.exit(1);
  }
}

main();
