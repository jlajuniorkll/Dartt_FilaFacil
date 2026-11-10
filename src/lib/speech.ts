// Client-side speech via the Web Speech API (window.speechSynthesis).
// No network, no API keys, no cost. Always runs in the browser.


export interface SpeechConfig {
  rate: number;
  volume: number;
  pitch: number;
  lang: string;
}

const config: SpeechConfig = {
  rate: 1,
  volume: 1,
  pitch: 1,
  lang: 'pt-BR',
};

export function configureSpeech(partial: Partial<SpeechConfig>): void {
  if (typeof partial.rate === 'number') config.rate = Math.min(2, Math.max(0.5, partial.rate));
  if (typeof partial.volume === 'number') config.volume = Math.min(1, Math.max(0, partial.volume));
  if (typeof partial.pitch === 'number') config.pitch = Math.min(2, Math.max(0, partial.pitch));
  if (typeof partial.lang === 'string' && partial.lang.trim()) config.lang = partial.lang;
}

export function getSpeechConfig(): SpeechConfig {
  return { ...config };
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

function getSynthesis(): SpeechSynthesis | null {
  return isSpeechSynthesisSupported() ? window.speechSynthesis : null;
}

// The voices list is asynchronous in several browsers (voiceschanged event).
// Resolve immediately when it is already available, otherwise wait with a timeout.
export function getVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const synth = getSynthesis();
  if (!synth) return Promise.resolve([]);

  const current = synth.getVoices();
  if (current.length > 0) return Promise.resolve(current);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    synth.addEventListener('voiceschanged', finish);
  });
}

// Prefer pt-BR, then any pt-*, then nothing (browser default). Never pick a
// specific vendor voice — the panel must work on Chrome/Edge/Smart TVs.
export function pickBrazilianVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const normalized = voices.map((voice) => ({ voice, lang: voice.lang.toLowerCase() }));
  const ptBr = normalized.find((entry) => entry.lang === 'pt-br' || entry.lang.startsWith('pt-br'));
  if (ptBr) return ptBr.voice;
  const ptAny = normalized.find((entry) => entry.lang === 'pt' || entry.lang.startsWith('pt'));
  if (ptAny) return ptAny.voice;
  return null;
}

const SPEAK_TIMEOUT_MS = 20000;

export async function speakAsync(text: string, overrides: Partial<SpeechConfig> = {}): Promise<boolean> {
  const synth = getSynthesis();
  if (!synth || typeof window === 'undefined' || typeof window.SpeechSynthesisUtterance !== 'function') {
    return false;
  }

  try {
    const voices = await getVoices();
    const voice = pickBrazilianVoice(voices);

    return await new Promise<boolean>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const effective = { ...config, ...overrides };
      utterance.lang = voice ? voice.lang : effective.lang;
      utterance.rate = effective.rate;
      utterance.volume = effective.volume;
      utterance.pitch = effective.pitch;
      if (voice) utterance.voice = voice;

      const timer = window.setTimeout(() => {
        synth.cancel();
        resolve(false);
      }, SPEAK_TIMEOUT_MS);

      utterance.onend = () => {
        window.clearTimeout(timer);
        resolve(true);
      };
      utterance.onerror = (event) => {
        window.clearTimeout(timer);
        const code = (event as SpeechSynthesisErrorEvent)?.error;
        console.warn('speechSynthesis error:', code);
        resolve(false);
      };

      synth.speak(utterance);
    });
  } catch (error) {
    console.error('Falha ao iniciar a fala:', error);
    return false;
  }
}

export function cancelSpeech(): void {
  const synth = getSynthesis();
  if (synth) synth.cancel();
}
