
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Ticket } from '@/lib/types';
import YoutubePlayer from '@/components/YoutubePlayer';
import { motion, AnimatePresence } from 'framer-motion';
import { textToSpeech } from '@/ai/flows/text-to-speech';

interface QueueStatus {
  lastCalled: Ticket | null;
  history: Ticket[];
  videos: string[];
}

export default function DisplayClient({ initialStatus }: { initialStatus: QueueStatus }) {
  const [status, setStatus] = useState<QueueStatus>(initialStatus);
  const notificationAudioRef = useRef<HTMLAudioElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const lastCalledTimestamp = useRef<string | null>(initialStatus.lastCalled?.calledAt ?? null);
  const isProcessingAudio = useRef(false);

  useEffect(() => {
    const playSoundSequence = async (ticket: Ticket) => {
      if (isProcessingAudio.current) return;
      isProcessingAudio.current = true;
      
      try {
        const notificationAudio = notificationAudioRef.current;
        const ttsAudio = ttsAudioRef.current;

        if (!notificationAudio || !ttsAudio) {
            console.error("Audio elements not available");
            isProcessingAudio.current = false;
            return;
        }

        let textForSpeech = `${ticket.isRepeat ? 'Repetindo Senha' : 'Senha'} ${ticket.ticketNumber}`;
        if (ticket.counter) {
          textForSpeech += ` no guichê ${ticket.counter}`;
        }
        
        // Start fetching TTS audio in parallel
        const ttsPromise = textToSpeech(textForSpeech);
        
        // Play notification sound
        await notificationAudio.play();

        // This event listener waits for the notification sound to finish
        notificationAudio.onended = async () => {
            try {
                // Now that notification is done, wait for the TTS promise to resolve
                const ttsResult = await ttsPromise;
                if(ttsResult.media) {
                    ttsAudio.src = ttsResult.media;
                    await ttsAudio.play();
                } else {
                    isProcessingAudio.current = false;
                }
            } catch (ttsError) {
                console.error("Error playing TTS audio:", ttsError);
                isProcessingAudio.current = false;
            }
        };
        
        // This event listener frees the lock when TTS audio finishes
        ttsAudio.onended = () => {
            isProcessingAudio.current = false;
        };
        
        // Error handling for robustness
        notificationAudio.onerror = () => {
             console.error("Notification audio failed to play.");
             isProcessingAudio.current = false;
        }
        ttsAudio.onerror = () => {
            console.error("TTS audio failed to play.");
            isProcessingAudio.current = false;
        }


      } catch (error) {
        console.error("Error in audio playback sequence:", error);
        // This catch block will handle errors from the initial notificationAudio.play() call
        isProcessingAudio.current = false;
      }
    };

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/queue/status');
        if (res.ok) {
          const newStatus: QueueStatus = await res.json();
          
          const hasNewCall = newStatus.lastCalled && newStatus.lastCalled.calledAt && newStatus.lastCalled.calledAt !== lastCalledTimestamp.current;

          setStatus(newStatus);
          
          if (hasNewCall) {
            lastCalledTimestamp.current = newStatus.lastCalled!.calledAt;
            // The browser must have autoplay enabled for this to work without user interaction
            // e.g., chrome://settings/content/sound -> Allow site
            // or by starting chrome with --autoplay-policy=no-user-gesture-required
            playSoundSequence(newStatus.lastCalled!);
          }
        }
      } catch (error) {
        console.error('Failed to fetch queue status:', error);
      }
    };

    const intervalId = setInterval(fetchStatus, 3000);
    return () => clearInterval(intervalId);
  }, []);

  const lastCalled = status.lastCalled;

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden relative">
      <audio ref={notificationAudioRef} src="/notification.mp3" preload="auto"></audio>
      <audio ref={ttsAudioRef} preload="auto"></audio>
      
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
