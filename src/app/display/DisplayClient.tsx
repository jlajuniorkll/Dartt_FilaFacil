'use client';

import { useState, useEffect } from 'react';
import type { Ticket } from '@/lib/types';
import YoutubePlayer from '@/components/YoutubePlayer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';

interface QueueStatus {
  lastCalled: Ticket | null;
  history: Ticket[];
  videos: string[];
}

export default function DisplayClient({ initialStatus }: { initialStatus: QueueStatus }) {
  const [status, setStatus] = useState<QueueStatus>(initialStatus);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/queue/status');
        if (res.ok) {
          const newStatus = await res.json();
          setStatus(newStatus);
        }
      } catch (error) {
        console.error('Failed to fetch queue status:', error);
      }
    };

    const intervalId = setInterval(fetchStatus, 3000); // Poll every 3 seconds

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden">
      {/* Left Column: History */}
      <aside className="w-[30%] h-full bg-card p-6 flex flex-col">
        <h2 className="text-2xl font-bold font-headline text-center mb-4 text-primary">Últimas Senhas</h2>
        <div className="flex-grow overflow-hidden">
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

      {/* Right Column: Main Display */}
      <main className="w-[70%] h-full flex flex-col p-6">
        {/* Top: Video Player */}
        <div className="flex-grow h-[65%] mb-6">
          <YoutubePlayer videoUrls={status.videos} />
        </div>

        {/* Bottom: Last Called */}
        <div className="flex-grow h-[35%] bg-card rounded-2xl flex flex-col items-center justify-center shadow-2xl">
           <AnimatePresence mode="wait">
            <motion.div
              key={status.lastCalled ? status.lastCalled.id : 'no-ticket'}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
              className="text-center"
            >
              {status.lastCalled ? (
                <>
                  <h1 className="text-2xl md:text-4xl font-headline text-muted-foreground mb-2">Senha Chamada</h1>
                  <p 
                    className="text-8xl md:text-9xl lg:text-[10rem] font-bold font-mono text-accent tracking-tighter"
                    style={{ lineHeight: 1 }}
                  >
                    {status.lastCalled.ticketNumber}
                  </p>
                </>
              ) : (
                <p className="text-4xl font-headline text-muted-foreground">Aguardando chamada...</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
