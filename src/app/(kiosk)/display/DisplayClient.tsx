'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Ticket } from '@/lib/types';
import YoutubePlayer from '@/components/YoutubePlayer';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Volume1, PlayCircle } from 'lucide-react';
import {
  buildAnnouncementSequence,
  buildSpokenText,
  announcementKey,
} from '@/lib/announcement';
import {
  configureSpeech,
  isSpeechSynthesisSupported,
  speakAsync,
  cancelSpeech,
} from '@/lib/speech';
import { playSequence, cancelFallbackAudio } from '@/lib/voice-fallback';

interface QueueStatus {
  lastCalled: Ticket | null;
  history: Ticket[];
  videos: string[];
}

type AudioState = 'off' | 'pending' | 'ready' | 'unavailable';

const STORAGE_KEY = 'filafacil.audio.enabled';
const RATE_KEY = 'filafacil.audio.rate';
const VOLUME_KEY = 'filafacil.audio.volume';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  } catch {
    return fallback;
  }
}

export default function DisplayClient({ initialStatus }: { initialStatus: QueueStatus }) {
  const [status, setStatus] = useState<QueueStatus>(initialStatus);
  const [audioState, setAudioState] = useState<AudioState>('off');
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const notificationAudioRef = useRef<HTMLAudioElement>(null);
  const announcedKeysRef = useRef<Set<string>>(
    new Set((initialStatus.history ?? []).map(announcementKey))
  );
  const announceQueueRef = useRef<Ticket[]>([]);
  const announcingRef = useRef(false);
  const audioStateRef = useRef<AudioState>('off');
  audioStateRef.current = audioState;
  const statusRef = useRef<QueueStatus>(initialStatus);
  statusRef.current = status;

  const speechAvailable = isSpeechSynthesisSupported();

  useEffect(() => {
    try {
      const storedRate = readStoredNumber(RATE_KEY, 1, 0.5, 2);
      const storedVolume = readStoredNumber(VOLUME_KEY, 1, 0, 1);
      setRate(storedRate);
      setVolume(storedVolume);
      configureSpeech({ rate: storedRate, volume: storedVolume });
      if (window.localStorage.getItem(STORAGE_KEY) === '1') {
        // Já ativado antes, mas o navegador pode exigir novo gesto do usuário.
        setAudioState('pending');
      }
    } catch {
      // localStorage indisponível: segue com o padrão
    }
    return () => {
      cancelSpeech();
      cancelFallbackAudio();
      if (notificationAudioRef.current) {
        notificationAudioRef.current.pause();
      }
      announceQueueRef.current = [];
      announcingRef.current = false;
    };
  }, []);

  const playNotification = useCallback(async (): Promise<void> => {
    const audio = notificationAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      await audio.play();
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 5000);
        audio.onended = () => {
          window.clearTimeout(timer);
          resolve();
        };
      });
    } catch {
      // Autoplay bloqueou o chime: segue para a voz mesmo assim
    }
  }, []);

  const speakGuarded = useCallback(
    async (text: string, sequence: string[]): Promise<boolean> => {
      if (isSpeechSynthesisSupported()) {
        const ok = await speakAsync(text);
        if (ok) return true;
        console.warn('speechSynthesis indisponível/falhou; tentando fallback de áudio local');
      }
      const ok = await playSequence(sequence, volume);
      if (!ok) {
        console.error('Fallback de voz indisponível (arquivos em /voice ausentes?)');
      }
      return ok;
    },
    [volume]
  );

  const announceTicket = useCallback(
    async (ticket: Ticket): Promise<boolean> => {
      await playNotification();
      const text = buildSpokenText(ticket);
      const sequence = buildAnnouncementSequence(ticket);
      return speakGuarded(text, sequence);
    },
    [playNotification, speakGuarded]
  );

  const drainAnnounceQueue = useCallback(async () => {
    if (announcingRef.current) return;
    announcingRef.current = true;
    while (announceQueueRef.current.length > 0) {
      const ticket = announceQueueRef.current.shift()!;
      try {
        const ok = await announceTicket(ticket);
        if (!ok) {
          console.error('Anúncio de voz falhou:', announcementKey(ticket));
          setAudioState((current) => (current === 'off' ? current : 'unavailable'));
        }
      } catch (error) {
        console.error('Erro no anúncio:', error);
      }
    }
    announcingRef.current = false;
  }, [announceTicket]);

  const activateAudio = useCallback(async () => {
    configureSpeech({ rate, volume });
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // sem persistência: mantém estado apenas em memória
    }
    setAudioState('ready');
    const audio = notificationAudioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    const ok = await speakGuarded('Voz do painel ativada.', ['teste']);
    if (!ok) setAudioState('unavailable');

    // Anuncia o estado atual uma vez para confirmar a cadeia completa.
    const current = statusRef.current.lastCalled;
    if (current) {
      announceQueueRef.current.push(current);
      drainAnnounceQueue();
    }
  }, [rate, volume, speakGuarded, drainAnnounceQueue]);

  const disableAudio = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignora
    }
    cancelSpeech();
    cancelFallbackAudio();
    announceQueueRef.current = [];
    setAudioState('off');
  }, []);

  const testVoice = useCallback(async () => {
    configureSpeech({ rate, volume });
    const ok = await speakGuarded('Voz do painel ativada.', ['teste']);
    setAudioState((current) => {
      if (current === 'off') return current;
      return ok ? 'ready' : 'unavailable';
    });
  }, [rate, volume, speakGuarded]);

  const onRateChange = useCallback(
    (value: number) => {
      const next = clamp(value, 0.5, 2);
      setRate(next);
      configureSpeech({ rate: next });
      try {
        window.localStorage.setItem(RATE_KEY, String(next));
      } catch {
        // ignora
      }
    },
    []
  );

  const onVolumeChange = useCallback((value: number) => {
    const next = clamp(value, 0, 1);
    setVolume(next);
    configureSpeech({ volume: next });
    try {
      window.localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // ignora
    }
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/queue/status');
        if (res.ok) {
          const newStatus: QueueStatus = await res.json();
          setStatus(newStatus);

          const history = newStatus.history ?? [];
          const fresh: Ticket[] = [];
          // Percorre do mais antigo para o mais novo para preservar a ordem.
          for (const ticket of [...history].reverse()) {
            const key = announcementKey(ticket);
            if (!announcedKeysRef.current.has(key)) {
              announcedKeysRef.current.add(key);
              fresh.push(ticket);
            }
          }
          if (fresh.length > 0 && audioStateRef.current === 'ready') {
            announceQueueRef.current.push(...fresh);
            drainAnnounceQueue();
          }
        }
      } catch (error) {
        console.error('Failed to fetch queue status:', error);
      }
    };

    const intervalId = setInterval(fetchStatus, 3000);
    return () => clearInterval(intervalId);
  }, [drainAnnounceQueue]);

  const lastCalled = status.lastCalled;
  const audioReady = audioState === 'ready';
  const audioLabel =
    audioState === 'ready'
      ? 'Áudio ativo'
      : audioState === 'pending'
        ? 'Clique para ativar o som'
        : audioState === 'unavailable'
          ? 'Áudio indisponível'
          : 'Som desativado';
  const AudioIcon = audioState === 'ready' ? Volume2 : audioState === 'off' ? VolumeX : Volume1;

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden relative">
      <audio ref={notificationAudioRef} src="/notification.mp3" preload="auto"></audio>

      <div className="absolute top-3 right-3 z-40 flex items-center gap-2 rounded-lg border border-border bg-card/85 backdrop-blur px-3 py-2 shadow-md">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            audioState === 'ready'
              ? 'bg-green-500'
              : audioState === 'pending'
                ? 'bg-amber-400 animate-pulse'
                : audioState === 'unavailable'
                  ? 'bg-red-500'
                  : 'bg-muted-foreground'
          }`}
          title={audioLabel}
          aria-hidden="true"
        />
        <span className="hidden md:inline text-xs text-muted-foreground">{audioLabel}</span>
        <button
          type="button"
          onClick={audioReady ? disableAudio : activateAudio}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          aria-pressed={audioReady}
        >
          <AudioIcon className="h-4 w-4" />
          {audioReady ? 'Desativar som' : 'Ativar som'}
        </button>
        <button
          type="button"
          onClick={testVoice}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <PlayCircle className="h-4 w-4" />
          Testar voz
        </button>
        <label className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground">
          Velocidade
          <select
            className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
            value={rate}
            onChange={(event) => onRateChange(Number(event.target.value))}
          >
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </label>
        <label className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground">
          Volume
          <select
            className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          >
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
          </select>
        </label>
      </div>

      <aside className="w-[30%] h-full bg-card p-6 flex flex-col">
        <h2 className="text-2xl font-bold font-headline text-center mb-4 text-primary shrink-0">Últimas Senhas</h2>
        <div className="flex-grow overflow-y-auto">
          <ul className="space-y-3">
             <AnimatePresence>
                {status.history.map((ticket, index) => (
                <motion.li
                    key={`${ticket.id}-${ticket.calledAt}`}
                    layout
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.5 }}
                    className={`p-3 rounded-lg text-center ${index === 0 ? 'bg-muted' : ''}`}
                >
                    <p className="text-3xl font-mono font-semibold tracking-wide text-muted-foreground">{ticket.ticketNumber}</p>
                     {ticket.counter && (
                        <p className="text-lg font-semibold text-primary">Guichê {ticket.counter}</p>
                    )}
                </motion.li>
                ))}
            </AnimatePresence>
          </ul>
        </div>
      </aside>

      <main className="w-[70%] h-full flex flex-col p-6 gap-6">
        <div className="h-[60%] w-full">
          <YoutubePlayer videoUrls={status.videos} />
        </div>

        <div className="h-[40%] w-full bg-card rounded-2xl flex flex-col items-center justify-center shadow-2xl p-4">
          <div className="text-center w-full">
            {lastCalled ? (
              <div className="flex flex-col items-center justify-center w-full">
                <motion.div
                  key={lastCalled.id + (lastCalled.calledAt || '')}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
                  className="w-full"
                >
                  <div className="text-center">
                    <p className="text-7xl md:text-8xl lg:text-9xl font-bold font-mono text-accent tracking-tighter" style={{ lineHeight: 1.1 }}>
                      {lastCalled.ticketNumber}
                    </p>
                    {lastCalled.counter && (
                      <p className="mt-4 text-4xl md:text-5xl lg:text-6xl font-headline text-primary tracking-tight">
                        Guichê {lastCalled.counter}
                      </p>
                    )}
                  </div>
                </motion.div>
              </div>
            ) : (
              <p className="text-4xl font-headline text-muted-foreground">Aguardando chamada...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
