// Local-audio fallback for announcements, without any external service.
// Plays a sequence of pre-recorded phrase files from /voice/<token>.wav.
// The phrase set lives in public/voice/ (see public/voice/README.md).

const BASE_PATH = '/voice';
const AVAILABILITY_TIMEOUT_MS = 4000;

let availabilityCache: boolean | null = null;
let activeAudios: HTMLAudioElement[] = [];

export interface RequiredTokensManifest {
  version: number;
  tokens: string[];
}

export async function fetchManifest(): Promise<RequiredTokensManifest | null> {
  try {
    const response = await fetch(`${BASE_PATH}/manifest.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = (await response.json()) as RequiredTokensManifest;
    if (!manifest || !Array.isArray(manifest.tokens) || manifest.tokens.length === 0) return null;
    return manifest;
  } catch {
    return null;
  }
}

export async function isFallbackAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  const manifest = await fetchManifest();
  if (!manifest) {
    availabilityCache = false;
    return false;
  }
  // Sample-check one file; if files are missing, HEAD requests fail fast.
  try {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);
    const probe = await fetch(`${BASE_PATH}/${manifest.tokens[0]}.wav`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    globalThis.clearTimeout(timer);
    availabilityCache = probe.ok;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

export function resetFallbackCacheForTesting(): void {
  availabilityCache = null;
}

async function playOne(token: string, volume: number): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const audio = new Audio(`${BASE_PATH}/${token}.wav`);
  audio.volume = volume;
  activeAudios.push(audio);
  try {
    return await new Promise<boolean>((resolve) => {
      const cleanup = (result: boolean) => {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        activeAudios = activeAudios.filter((item) => item !== audio);
        resolve(result);
      };
      audio.onended = () => cleanup(true);
      audio.onerror = () => cleanup(false);
      audio.play().catch(() => cleanup(false));
    });
  } catch {
    activeAudios = activeAudios.filter((item) => item !== audio);
    return false;
  }
}

export async function playSequence(tokens: string[], volume = 1): Promise<boolean> {
  if (tokens.length === 0) return false;
  for (const token of tokens) {
    const ok = await playOne(token, volume);
    if (!ok) return false;
    // Pequena pausa entre frases para clareza.
    await new Promise((resolve) => globalThis.setTimeout(resolve, 40));
  }
  return true;
}

export function cancelFallbackAudio(): void {
  for (const audio of activeAudios) {
    audio.pause();
    audio.src = '';
  }
  activeAudios = [];
}
