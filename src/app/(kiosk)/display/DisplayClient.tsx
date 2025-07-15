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
    const playSounds = async (ticket: Ticket) => {
      if (isProcessingAudio.current) return;
      isProcessingAudio.current = true;

      try {
        let textForSpeech = `${ticket.isRepeat ? 'Repetindo Senha' : 'Senha'} ${ticket.ticketNumber}`;
        if (ticket.counter) {
          textForSpeech += ` no guichê ${ticket.counter}`;
        }
        
        const ttsPromise = textToSpeech(textForSpeech);

        const notificationAudio = notificationAudioRef.current;
        if (notificationAudio) {
            notificationAudio.currentTime = 0;
            const playPromise = notificationAudio.play();
            if(playPromise !== undefined) {
               await playPromise.catch(e => console.error("Error playing notification sound:", e));
            }
            // Wait for notification to finish
            await new Promise(resolve => {
                const onEnded = () => {
                    notificationAudio.removeEventListener('ended', onEnded);
                    resolve(null);
                };
                notificationAudio.addEventListener('ended', onEnded);
            });
        }
        
        const { media } = await ttsPromise;

        const ttsAudio = ttsAudioRef.current;
        if (media && ttsAudio) {
            ttsAudio.src = media;
            await ttsAudio.play();
        }
      } catch (error) {
        console.error("Error with audio playback:", error);
      } finally {
        isProcessingAudio.current = false;
      }
    };

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/queue/status');
        if (res.ok) {
          const newStatus: QueueStatus = await res.json();
          setStatus(newStatus);
          
          if (newStatus.lastCalled && newStatus.lastCalled.calledAt && newStatus.lastCalled.calledAt !== lastCalledTimestamp.current) {
            lastCalledTimestamp.current = newStatus.lastCalled.calledAt;
            playSounds(newStatus.lastCalled);
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
    <div className="flex h-screen w-screen bg-background overflow-hidden">
      <audio ref={notificationAudioRef} src="/notification.mp3" preload="auto"></audio>
      <audio ref={ttsAudioRef} preload="auto"></audio>
      
      <aside className="w-[30%] h-full bg-card p-6 flex flex-col">
        <h2 className="text-2xl font-bold font-headline text-center mb-4 text-primary shrink-0">Últimas Senhas</h2>
        <div className="flex-grow overflow-y-auto">
          <ul className="space-y-3">
             <AnimatePresence>
                {status.history.map((ticket, index) => (
                <motion.li
                    key={ticket.id}
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

        <div className="h-[40%] w-full bg-card rounded-2xl flex flex-col items-center justify-center shadow-2xl">
          <div className="text-center">
            {lastCalled ? (
              <div className="flex flex-col items-center justify-center">
                 <motion.p
                  key={lastCalled.id + (lastCalled.calledAt || '')}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
                  className="text-8xl md:text-9xl lg:text-[10rem] font-bold font-mono text-accent tracking-tighter"
                  style={{ lineHeight: 1 }}
                >
                  {lastCalled.ticketNumber}
                </motion.p>
                {lastCalled.counter && (
                  <motion.div
                    key={(lastCalled.id + (lastCalled.calledAt || '')) + '-counter'}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="mt-4"
                  >
                    <h2 className="text-2xl md:text-4xl font-headline text-muted-foreground mb-1">Guichê</h2>
                    <p className="text-6xl md:text-7xl font-bold font-mono text-primary tracking-tight">
                        {lastCalled.counter}
                    </p>
                  </motion.div>
                )}
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
