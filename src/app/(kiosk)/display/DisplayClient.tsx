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
        const textForSpeech = `${ticket.isRepeat ? 'Repetindo Senha' : 'Senha'} ${ticket.ticketNumber}`;
        const ttsPromise = textToSpeech(textForSpeech);

        const notificationAudio = notificationAudioRef.current;
        if (notificationAudio) {
            notificationAudio.currentTime = 0;
            const playPromise = notificationAudio.play();
            if(playPromise !== undefined) {
                playPromise.catch(e => console.error("Error playing notification sound:", e));
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
        // Add a small delay before unlocking to prevent rapid re-triggering
        setTimeout(() => {
            isProcessingAudio.current = false;
        }, 500);
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

  return (
    <div className="flex h-screen w-screen bg-background">
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
            {status.lastCalled ? (
              <>
                <h1 className="text-2xl md:text-4xl font-headline text-muted-foreground mb-2">Senha Chamada</h1>
                 <motion.p
                  key={status.lastCalled.id + (status.lastCalled.calledAt || '')}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
                  className="text-8xl md:text-9xl lg:text-[10rem] font-bold font-mono text-accent tracking-tighter"
                  style={{ lineHeight: 1 }}
                >
                  {status.lastCalled.ticketNumber}
                </motion.p>
              </>
            ) : (
              <p className="text-4xl font-headline text-muted-foreground">Aguardando chamada...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
