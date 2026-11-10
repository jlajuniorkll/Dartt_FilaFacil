// Testes da fase 2E — anúncio de voz (lógica pura, sem DOM).
import fs from 'node:fs';
import path from 'node:path';

import {
  buildAnnouncementSequence,
  buildSpokenText,
  announcementKey,
  pickAnnouncementStrategy,
} from '../src/lib/announcement';
import type { Ticket } from '../src/lib/types';

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

function ticket(partial: Partial<Ticket>): Ticket {
  return {
    id: 't1',
    ticketNumber: 'N001',
    type: 'btn-2',
    prefix: 'N',
    timestamp: new Date().toISOString(),
    called: true,
    calledAt: new Date().toISOString(),
    displayNumber: 1,
    ...partial,
  };
}

const run = async () => {
  await check('anúncio de senha normal: texto falado correto', () => {
    const t = ticket({ ticketNumber: 'N001', prefix: 'N', displayNumber: 1 });
    const text = buildSpokenText(t);
    assert(text === 'Senha êne um', `texto=${text}`);
  });

  await check('anúncio de senha preferencial: prefixo alfanumérico falado por letra', () => {
    const t = ticket({ ticketNumber: 'P245', prefix: 'P', displayNumber: 245, type: 'btn-1' });
    const text = buildSpokenText(t);
    assert(text === 'Senha pê duzentos e quarenta e cinco', `texto=${text}`);
  });

  await check('prefixo alfanumérico composto (JU120): letras soletradas', () => {
    const t = ticket({ ticketNumber: 'JU120', prefix: 'JU', displayNumber: 120 });
    const text = buildSpokenText(t);
    assert(text === 'Senha jota, u cento e vinte', `texto=${text}`);
    const seq = buildAnnouncementSequence(t);
    assert(JSON.stringify(seq) === JSON.stringify(['senha', 'letra-j', 'letra-u', 'cento', 'e', 'vinte']), `seq=${seq.join(',')}`);
  });

  await check('guichê com números de diferentes tamanhos (1 e 245)', () => {
    const small = ticket({ displayNumber: 7, counter: 1 });
    const large = ticket({ displayNumber: 7, counter: 245 });
    assert(buildSpokenText(small).endsWith('no guichê um'), 'guichê pequeno');
    assert(buildSpokenText(large).endsWith('no guichê duzentos e quarenta e cinco'), 'guichê grande');
    const seq = buildAnnouncementSequence(large);
    assert(seq.slice(-6).join(',') === 'guiche,duzentos,e,quarenta,e,cinco', `seq=${seq.join(',')}`);
  });

  await check('duas chamadas consecutivas geram chaves distintas (sem dedupe indevido)', () => {
    const t1 = ticket({ id: 'a', calledAt: '2026-01-01T10:00:00.000Z' });
    const t2 = ticket({ id: 'a', calledAt: '2026-01-01T10:05:00.000Z' });
    assert(announcementKey(t1) !== announcementKey(t2), 'mesmo id+calledAt');
    const t3 = ticket({ id: 'b', calledAt: '2026-01-01T10:00:00.000Z' });
    assert(announcementKey(t1) !== announcementKey(t3), 'id diferente');
  });

  await check('repetição de chamada: texto e sequência de repetição', () => {
    const t = ticket({ isRepeat: true, prefix: 'P', displayNumber: 12 });
    const text = buildSpokenText(t);
    assert(text.startsWith('Repetindo senha'), `texto=${text}`);
    const seq = buildAnnouncementSequence(t);
    assert(JSON.stringify(seq) === JSON.stringify(['repetindo', 'letra-p', 'doze']), `seq=${seq.join(',')}`);
  });

  await check('números longos: mil/misto e fallback dígito a dígito acima de 9999', () => {
    const mil = ticket({ displayNumber: 1234 });
    assert(buildSpokenText(mil).includes('mil e duzentos e trinta e quatro'), 'mil');
    const big = ticket({ displayNumber: 12345 });
    const seq = buildAnnouncementSequence(big);
    assert(seq.length > 0, 'sequência longa');
    assert(seq.every((token) => /^[a-z-]+$/.test(token)), 'tokens ASCII');
  });

  await check('sequência do fallback usa apenas tokens do manifesto (extra)', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public', 'voice', 'manifest.json'), 'utf8')
    ) as { version: number; tokens: string[] };
    assert(manifest.version === 1, 'versão do manifesto');
    assert(manifest.tokens.length > 0, 'manifesto vazio');
    const tokenSet = new Set(manifest.tokens);

    const sampleTickets = [
      ticket({ prefix: 'N', displayNumber: 1, counter: 1 }),
      ticket({ prefix: 'P', displayNumber: 245, counter: 12, isRepeat: true }),
      ticket({ prefix: 'EX', displayNumber: 7, counter: 100 }),
      ticket({ prefix: 'A', displayNumber: 9999, counter: 9 }),
      ticket({ prefix: 'Z', displayNumber: 100, counter: 3 }),
    ];
    for (const sample of sampleTickets) {
      for (const token of buildAnnouncementSequence(sample)) {
        assert(tokenSet.has(token), `token fora do manifesto: ${token}`);
      }
    }
  });

  await check('decisão de anúncio: speechSynthesis ausente implica fallback', () => {
    assert(pickAnnouncementStrategy(false) === 'fallback', 'sem API deveria usar fallback');
    assert(pickAnnouncementStrategy(true) === 'speech', 'com API deveria usar speech');
  });

  await check('ausência total de referência a Gemini/Google AI na árvore src', () => {
    const root = path.join(process.cwd(), 'src');
    const stack: string[] = [root];
    const forbidden = /googleai|genkit|generativelanguage|gemini|GOOGLE_API_KEY|GEMINI_API_KEY/i;
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          assert(!forbidden.test(content), `referência a Gemini/Genkit em ${full}`);
        }
      }
    }
  });

  await check('nenhuma chamada de rede para serviços TTS/Google no código ativo', () => {
    const files = [
      'src/app/(kiosk)/display/DisplayClient.tsx',
      'src/lib/speech.ts',
      'src/lib/voice-fallback.ts',
      'src/lib/announcement.ts',
    ];
    for (const file of files) {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      assert(!/https?:\/\//.test(content), `${file} contém URL externa`);
    }
  });

  await check('gerador de áudio referencia espeak-ng e o manifesto oficial', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'generate-voice-phrases.ts'), 'utf8');
    assert(source.includes('espeak-ng'), 'gerador não usa espeak-ng');
    assert(source.includes('manifest.json'), 'gerador não lê o manifesto');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public', 'voice', 'manifest.json'), 'utf8')
    ) as { tokens: string[] };
    for (const token of manifest.tokens) {
      const present = source.includes(`'${token}'`) || source.includes(`${token}:`);
      assert(present, `gerador sem texto para o token ${token}`);
    }
  });

  // ---- Fase 2E.1: integridade física dos arquivos de fallback ----

  await check('manifesto íntegro: tokens únicos, formato e cobertura exaustiva', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public', 'voice', 'manifest.json'), 'utf8')
    ) as { version: number; tokens: string[] };
    assert(manifest.version === 1, 'versão do manifesto');
    assert(new Set(manifest.tokens).size === manifest.tokens.length, 'tokens duplicados');
    for (const token of manifest.tokens) {
      assert(/^[a-z][a-z0-9-]*$/.test(token), `token fora do formato ASCII: ${token}`);
    }
    const tokenSet = new Set(manifest.tokens);
    // Varredura exaustiva: todos os números, prefixos e guichês suportados.
    for (let n = 0; n <= 9999; n += 1) {
      for (const token of buildAnnouncementSequence(ticket({ displayNumber: n, counter: n % 100 }))) {
        assert(tokenSet.has(token), `token ausente para n=${n}: ${token}`);
      }
    }
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      for (const token of buildAnnouncementSequence(ticket({ prefix: ch, displayNumber: 1, counter: 1 }))) {
        assert(tokenSet.has(token), `token ausente para prefixo ${ch}: ${token}`);
      }
    }
    for (let big = 10000; big <= 99999; big += 7919) {
      for (const token of buildAnnouncementSequence(ticket({ displayNumber: big, counter: 1 }))) {
        assert(tokenSet.has(token), `token ausente para n=${big}: ${token}`);
      }
    }
  });

  await check('todos os arquivos do manifesto existem e não estão vazios', () => {
    const dir = path.join(process.cwd(), 'public', 'voice');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { tokens: string[] };
    for (const token of manifest.tokens) {
      const file = path.join(dir, `${token}.wav`);
      assert(fs.existsSync(file), `arquivo ausente: ${token}.wav`);
      const stat = fs.statSync(file);
      assert(stat.size > 1024, `arquivo vazio/curto: ${token}.wav (${stat.size} bytes)`);
    }
    // Nenhum áudio órfão fora do manifesto.
    const orphans = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.wav') && !manifest.tokens.includes(name.replace(/\.wav$/, '')));
    assert(orphans.length === 0, `áudios órfãos: ${orphans.join(', ')}`);
  });

  await check('áudios válidos: RIFF/PCM mono 16-bit com duração plausível', () => {
    const dir = path.join(process.cwd(), 'public', 'voice');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { tokens: string[] };
    for (const token of manifest.tokens) {
      const buf = fs.readFileSync(path.join(dir, `${token}.wav`));
      assert(buf.toString('ascii', 0, 4) === 'RIFF', `${token}: sem RIFF`);
      assert(buf.toString('ascii', 8, 12) === 'WAVE', `${token}: sem WAVE`);
      assert(buf.readUInt16LE(20) === 1, `${token}: formato não-PCM`);
      assert(buf.readUInt16LE(22) === 1, `${token}: não-mono`);
      assert(buf.readUInt16LE(34) === 16, `${token}: não 16-bit`);
      const rate = buf.readUInt32LE(28);
      const duration = buf.readUInt32LE(40) / rate / 2;
      assert(duration >= 0.05 && duration <= 3, `${token}: duração implausível (${duration.toFixed(2)}s)`);
      assert(rate === 22050 || rate === 44100, `${token}: taxa incomum (${rate})`);
    }
  });

  await check('Dockerfile copia public/ para o standalone (áudios entram na imagem)', () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
    assert(/COPY\s+--from=builder\s+--chown=\S+\s+\/app\/public\s+\.\/public/.test(dockerfile), 'Dockerfile não copia /app/public');
    // O gerador grava exatamente nesse diretório.
    const gen = fs.readFileSync(path.join(process.cwd(), 'scripts', 'generate-voice-phrases.ts'), 'utf8');
    assert(gen.includes("path.join(process.cwd(), 'public', 'voice')"), 'gerador fora de public/voice');
    assert(dockerfile.includes('standalone'), 'Dockerfile sem etapa standalone');
  });

  // ---- Fase 2E.1: comportamento do player (mock de DOM) ----

  const g = globalThis as unknown as {
    window?: unknown;
    Audio?: unknown;
    fetch?: typeof fetch;
  };
  const savedWindow = g.window;
  const savedAudio = g.Audio;
  const savedFetch = g.fetch;

  class MockAudio {
    static failFor = new Set<string>();
    static events: string[] = [];
    src = '';
    volume = 1;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(src: string) {
      this.src = src;
    }
    play(): Promise<void> {
      const token = this.src.split('/').pop() ?? '';
      MockAudio.events.push(`play:${token}`);
      globalThis.setTimeout(() => {
        if (MockAudio.failFor.has(token)) {
          MockAudio.events.push(`error:${token}`);
          this.onerror?.();
        } else {
          MockAudio.events.push(`end:${token}`);
          this.onended?.();
        }
      }, 1);
      return Promise.resolve();
    }
    pause(): void {
      // silencioso
    }
  }

  await check('URLs do fallback: /voice/<token>.wav coerentes com o manifesto', async () => {
    const { playSequence, cancelFallbackAudio } = await import('../src/lib/voice-fallback');
    g.window = {};
    g.Audio = MockAudio as unknown as typeof Audio;
    MockAudio.events = [];
    MockAudio.failFor = new Set();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public', 'voice', 'manifest.json'), 'utf8')
    ) as { tokens: string[] };
    const ok = await playSequence(['senha', 'letra-p', 'cento'], 1);
    assert(ok, 'sequência deveria ter sucesso');
    const played = MockAudio.events.filter((e) => e.startsWith('play:'));
    assert(played.length === 3, `tocadas=${played.length}`);
    for (const event of played) {
      const token = event.slice('play:'.length).replace(/\.wav$/, '');
      assert(/^\/voice\/[a-z0-9-]+\.wav$/.test(`/voice/${token}.wav`), `URL inválida: ${event}`);
      assert(manifest.tokens.includes(token), `token fora do manifesto: ${token}`);
    }
    cancelFallbackAudio();
  });

  await check('reprodução sequencial sem sobreposição e falha aborta a sequência', async () => {
    const { playSequence, cancelFallbackAudio } = await import('../src/lib/voice-fallback');
    g.window = {};
    g.Audio = MockAudio as unknown as typeof Audio;
    // Sucesso: cada play só inicia após o end do anterior (ordem estrita).
    MockAudio.events = [];
    MockAudio.failFor = new Set();
    const ok = await playSequence(['senha', 'um', 'guiche', 'dois'], 1);
    assert(ok, 'sequência completa deveria ter sucesso');
    assert(
      JSON.stringify(MockAudio.events) ===
        JSON.stringify(['play:senha.wav', 'end:senha.wav', 'play:um.wav', 'end:um.wav', 'play:guiche.wav', 'end:guiche.wav', 'play:dois.wav', 'end:dois.wav']),
      `ordem: ${MockAudio.events.join(' | ')}`
    );
    // Falha no meio: aborta e não toca o restante.
    MockAudio.events = [];
    MockAudio.failFor = new Set(['guiche.wav']);
    const failed = await playSequence(['senha', 'guiche', 'dois'], 1);
    assert(failed === false, 'sequência com falha deveria retornar false');
    const playedTokens = MockAudio.events.filter((e) => e.startsWith('play:'));
    assert(!playedTokens.includes('play:dois.wav'), `não deveria tocar após falha: ${playedTokens.join(',')}`);
    MockAudio.failFor = new Set();
    // Chamadas consecutivas (repetição de senha): duas sequências seguidas.
    MockAudio.events = [];
    assert((await playSequence(['senha', 'um'], 1)) === true, '1ª chamada');
    assert((await playSequence(['repetindo', 'um'], 1)) === true, '2ª chamada (repetição)');
    const plays = MockAudio.events.filter((e) => e.startsWith('play:'));
    assert(plays.length === 4, `4 reproduções esperadas, vieram ${plays.length}`);
    assert(plays[2] === 'play:repetindo.wav', `repetição deveria reiniciar: ${plays[2]}`);
    cancelFallbackAudio();
  });

  await check('disponibilidade do fallback: manifesto OK vs falha de rede', async () => {
    const { isFallbackAvailable, resetFallbackCacheForTesting } = await import('../src/lib/voice-fallback');
    g.window = {};
    // Cenário A: manifesto GET ok + HEAD do arquivo ok → disponível.
    resetFallbackCacheForTesting();
    g.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'HEAD') return { ok: true } as unknown as Response;
      return {
        ok: true,
        json: async () => ({ version: 1, tokens: ['senha'] }),
      } as unknown as Response;
    }) as typeof fetch;
    assert((await isFallbackAvailable()) === true, 'manifesto+arquivo OK → disponível');
    // Cenário B: rede indisponível → indisponível.
    resetFallbackCacheForTesting();
    g.fetch = (async () => {
      throw new Error('rede indisponível');
    }) as typeof fetch;
    assert((await isFallbackAvailable()) === false, 'rede falha → indisponível');
    // Cenário C: manifesto inexistente → indisponível.
    resetFallbackCacheForTesting();
    g.fetch = (async () => ({ ok: false } as unknown as Response)) as typeof fetch;
    assert((await isFallbackAvailable()) === false, 'manifesto 404 → indisponível');
    // Cenário D: manifesto ok mas arquivo ausente (HEAD falha) → indisponível.
    resetFallbackCacheForTesting();
    g.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'HEAD') return { ok: false } as unknown as Response;
      return {
        ok: true,
        json: async () => ({ version: 1, tokens: ['senha'] }),
      } as unknown as Response;
    }) as typeof fetch;
    assert((await isFallbackAvailable()) === false, 'arquivo ausente → indisponível');
    // Restaura o ambiente para os testes seguintes.
    resetFallbackCacheForTesting();
    g.fetch = savedFetch;
    g.Audio = savedAudio;
    g.window = savedWindow;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} testes de voz passaram.`);

  if (failed.length > 0) process.exit(1);
};

run().catch((error) => {
  console.error('Erro fatal nos testes de voz:', error);
  process.exit(1);
});
