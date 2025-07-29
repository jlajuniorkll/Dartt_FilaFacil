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

// Helper function to create a Promise that resolves when an audio element ends
const awaitAudioEnd = (audioElement: HTMLAudioElement): Promise<void> => {
    return new Promise(resolve => {
        const onEnded = () => {
            audioElement.removeEventListener('ended', onEnded);
            resolve();
        };
        audioElement.addEventListener('ended', onEnded);
    });
};


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
        const notificationAudio = notificationAudioRef.current;
        const ttsAudio = ttsAudioRef.current;
        
        // 1. Generate the speech audio in the background
        let textForSpeech = `${ticket.isRepeat ? 'Repetindo Senha' : 'Senha'} ${ticket.ticketNumber}`;
        if (ticket.counter) {
          textForSpeech += ` no guichê ${ticket.counter}`;
        }
        const ttsPromise = textToSpeech(textForSpeech);
        
        // 2. Play the notification sound
        if (notificationAudio && notificationAudio.src) {
           try {
              await notificationAudio.play();
              await awaitAudioEnd(notificationAudio); // Wait for it to finish
           } catch(e) {
             console.error("Error playing notification sound. It might require user interaction.", e);
           }
        }
        
        // 3. Play the TTS audio
        const { media } = await ttsPromise;
        if (media && ttsAudio) {
            ttsAudio.src = media;
            await ttsAudio.play().catch(e => console.error("Error playing TTS sound:", e));
        }

      } catch (error) {
        console.error("Error with audio playback flow:", error);
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
  
  // A simple interaction to allow audio to play automatically.
  const handleInitialInteraction = () => {
    // This function attempts to "unlock" the audio elements for autoplay.
    // It's called on the first click/tap on the screen.
    const notification = notificationAudioRef.current;
    if (notification && notification.paused) {
        notification.play().catch(() => {});
        notification.pause();
    }
    const tts = ttsAudioRef.current;
    if(tts && tts.paused) {
        tts.play().catch(() => {});
        tts.pause();
    }
  };


  const lastCalled = status.lastCalled;

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden" onClick={handleInitialInteraction}>
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
