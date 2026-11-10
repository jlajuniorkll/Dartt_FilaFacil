import type { Ticket } from './types';

// Pure helpers that turn a ticket into (a) the spoken sentence used by the
// Web Speech API and (b) the ordered list of pre-recorded phrase files used
// by the local-audio fallback. Kept DOM-free so it can be unit-tested.

export interface AnnouncementOptions {
  preferentialLabel?: string;
}

const UNITS = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
];
const LETTERS: Record<string, string> = {
  a: 'a', b: 'bê', c: 'cê', d: 'dê', e: 'é', f: 'éfe', g: 'gê', h: 'agá',
  i: 'i', j: 'jota', k: 'cá', l: 'éle', m: 'ême', n: 'êne', o: 'ó', p: 'pê',
  q: 'quê', r: 'érre', s: 'ésse', t: 'tê', u: 'u', v: 'vê', w: 'dáblio',
  x: 'xis', y: 'ípsilon', z: 'zê',
};

function numberTokens(n: number): string[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Número fora do intervalo suportado: ${n}`);
  }
  if (n <= 999) {
    if (n < 20) return [UNITS[n]];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const unit = n % 10;
      if (unit === 0) return [TENS[ten]];
      return [TENS[ten], 'e', UNITS[unit]];
    }
    if (n === 100) return ['cem'];
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    const tokens = [HUNDREDS[hundred]];
    if (remainder > 0) {
      tokens.push('e', ...numberTokens(remainder));
    }
    return tokens;
  }
  if (n <= 9999) {
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    const tokens: string[] = [];
    if (thousands === 1) {
      tokens.push('mil');
    } else {
      tokens.push(...numberTokens(thousands), 'mil');
    }
    if (remainder > 0) {
      tokens.push('e', ...numberTokens(remainder));
    }
    return tokens;
  }
  // Acima de 9999: lê dígito a dígito para nunca falhar.
  return String(n).split('').map((digit) => UNITS[Number(digit)]);
}

function numberToWords(n: number): string {
  return numberTokens(n).join(' ');
}

function slug(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
export function normalizePrefix(prefix: string): string {
  return prefix.trim().toUpperCase();
}

// Tokens for the local audio fallback (one file per token).
export function buildAnnouncementSequence(ticket: Ticket): string[] {
  const tokens: string[] = [];
  if (ticket.isRepeat) {
    tokens.push('repetindo'); // "Repetindo senha" (frase completa no arquivo)
  } else {
    tokens.push('senha');
  }

  for (const char of normalizePrefix(ticket.prefix)) {
    if (/[0-9]/.test(char)) {
      tokens.push(UNITS[Number(char)]);
    } else if (LETTERS[char.toLowerCase()]) {
      tokens.push(`letra-${char.toLowerCase()}`);
    }
    // Caracteres não reconhecidos são silenciosamente descartados.
  }

  tokens.push(...numberTokens(ticket.displayNumber));

  if (ticket.counter && Number.isInteger(ticket.counter) && ticket.counter > 0) {
    tokens.push('guiche', ...numberTokens(ticket.counter));
  }
  return tokens.map(slug);
}

// Full sentence used by the Web Speech API.
export function buildSpokenText(ticket: Ticket): string {
  const parts: string[] = [];
  parts.push(ticket.isRepeat ? 'Repetindo senha' : 'Senha');

  const prefix = normalizePrefix(ticket.prefix);
  const letters = [...prefix]
    .map((char) => (/[0-9]/.test(char) ? UNITS[Number(char)] : LETTERS[char.toLowerCase()]))
    .filter((part): part is string => Boolean(part));
  if (letters.length > 0) {
    parts.push(letters.join(', '));
  }

  parts.push(numberToWords(ticket.displayNumber));

  if (ticket.counter && Number.isInteger(ticket.counter) && ticket.counter > 0) {
    parts.push(`no guichê ${numberToWords(ticket.counter)}`);
  }
  return parts.join(' ');
}

// Unique key for deduping announcements. Repeats produce a new key because
// repeatLastCall updates calledAt.
export function announcementKey(ticket: Ticket): string {
  return `${ticket.id}:${ticket.calledAt ?? ''}`;
}

export type AnnouncementStrategy = 'speech' | 'fallback';

// Decision helper (pure, testable). speechAvailable reflects whether
// window.speechSynthesis exists; actual utterance success is verified at
// runtime by the caller, which must fall back to 'fallback' on failure.
export function pickAnnouncementStrategy(speechAvailable: boolean): AnnouncementStrategy {
  return speechAvailable ? 'speech' : 'fallback';
}
