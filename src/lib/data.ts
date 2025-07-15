'use server';
import type { AppSettings, ButtonConfig, Ticket } from './types';
import { revalidatePath } from 'next/cache';

// This is a workaround to simulate a persistent in-memory store in a serverless environment.
// In a real-world application, you would use a proper database like Firestore or Redis.
const globalForStore = globalThis as unknown as {
  settings: AppSettings;
  tickets: Ticket[];
  sequenceCounters: { [key: string]: number };
  callCounters: { [key: string]: number };
  lastCalled: Ticket | null;
  callHistory: Ticket[];
  isCalling: boolean; // Add lock state
};

const initialSettings: AppSettings = {
  buttons: [
    { id: 'btn-1', name: 'Preferencial', prefix: 'P', priority: 1, frequency: 2, color: '#5DADE2', textColor: '#FFFFFF' },
    { id: 'btn-2', name: 'Normal', prefix: 'N', priority: 2, frequency: 1, color: '#F39C12', textColor: '#FFFFFF' },
  ],
  youtubeUrls: [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=3Z1_p7-v7v8',
  ],
  priorityEnabled: true,
};

const store = {
  settings: globalForStore.settings ?? JSON.parse(JSON.stringify(initialSettings)),
  tickets: globalForStore.tickets ?? [],
  sequenceCounters: globalForStore.sequenceCounters ?? { 'btn-1': 0, 'btn-2': 0 },
  callCounters: globalForStore.callCounters ?? { 'btn-1': 0, 'btn-2': 0 },
  lastCalled: globalForStore.lastCalled ?? null,
  callHistory: globalForStore.callHistory ?? [],
  isCalling: globalForStore.isCalling ?? false,
};

if (process.env.NODE_ENV !== 'production' || !globalForStore.settings) {
  globalForStore.settings = store.settings;
  globalForStore.tickets = store.tickets;
  globalForStore.sequenceCounters = store.sequenceCounters;
  globalForStore.callCounters = store.callCounters;
  globalForStore.lastCalled = store.lastCalled;
  globalForStore.callHistory = store.callHistory;
  globalForStore.isCalling = store.isCalling;
}


// --- Settings Management ---
export async function getSettings(): Promise<AppSettings> {
  return Promise.resolve(JSON.parse(JSON.stringify(globalForStore.settings)));
}

export async function updateSettings(newSettings: AppSettings): Promise<AppSettings> {
  globalForStore.settings = JSON.parse(JSON.stringify(newSettings));
  // Ensure counters exist for new buttons
  globalForStore.settings.buttons.forEach(btn => {
    if (!globalForStore.sequenceCounters[btn.id]) {
      globalForStore.sequenceCounters[btn.id] = 0;
    }
    if (!globalForStore.callCounters[btn.id]) {
      globalForStore.callCounters[btn.id] = 0;
    }
  });
  return getSettings();
}

// --- Ticket Management ---

function markTicketAsCalled(ticketToCall: Ticket, isRepeat = false) {
    const originalTicket = globalForStore.tickets.find(t => t.id === ticketToCall.id);
    if (!originalTicket && !isRepeat) return null; // If not repeating, ticket must exist

    let ticketToUpdate: Ticket;

    if (isRepeat && globalForStore.lastCalled) {
        // For repeats, we use the lastCalled ticket as the base
        ticketToUpdate = globalForStore.lastCalled;
    } else if (originalTicket) {
        // For new calls, we use the ticket from the queue
        ticketToUpdate = originalTicket;
    } else {
        return null;
    }

    // Update state for the called ticket
    ticketToUpdate.called = true;
    ticketToUpdate.calledAt = new Date().toISOString(); // ALWAYS update timestamp to trigger display
    ticketToUpdate.isRepeat = isRepeat;

    globalForStore.lastCalled = JSON.parse(JSON.stringify(ticketToUpdate));

    if (!isRepeat) {
        // Add to history only on the first call, not on repeats
        const historyIndex = globalForStore.callHistory.findIndex(t => t.id === ticketToUpdate.id);
        if (historyIndex > -1) {
            globalForStore.callHistory.splice(historyIndex, 1);
        }
        globalForStore.callHistory.unshift(JSON.parse(JSON.stringify(ticketToUpdate)));
        if (globalForStore.callHistory.length > 10) {
            globalForStore.callHistory.pop();
        }
    }
    
    return globalForStore.lastCalled;
}

export async function generateTicket(buttonId: string): Promise<Ticket> {
  const button = globalForStore.settings.buttons.find(b => b.id === buttonId);
  if (!button) {
    throw new Error('Button configuration not found');
  }

  globalForStore.sequenceCounters[buttonId] = (globalForStore.sequenceCounters[buttonId] || 0) + 1;
  const newTicket: Ticket = {
    id: `ticket-${Date.now()}`,
    type: button.id,
    prefix: button.prefix,
    displayNumber: globalForStore.sequenceCounters[buttonId],
    ticketNumber: `${button.prefix}${globalForStore.sequenceCounters[buttonId].toString().padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    called: false,
  };

  globalForStore.tickets.push(newTicket);
  return JSON.parse(JSON.stringify(newTicket));
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (globalForStore.isCalling) {
    throw new Error('Uma chamada já está em andamento. Por favor, aguarde.');
  }
  globalForStore.isCalling = true;
  try {
    return await fn();
  } finally {
    globalForStore.isCalling = false;
  }
}


export async function callNextTicket(): Promise<Ticket | null> {
  return withLock(async () => {
    let ticketToCall: Ticket | undefined;
    
    if (globalForStore.settings.priorityEnabled) {
      const pendingTickets = globalForStore.tickets.filter(t => !t.called);
      if (pendingTickets.length === 0) return null;

      const sortedButtons = [...globalForStore.settings.buttons].sort((a, b) => a.priority - b.priority);

      let foundTicket = false;
      for (const button of sortedButtons) {
          const callCount = globalForStore.callCounters[button.id] || 0;
          if (callCount < button.frequency) {
              const eligibleTicket = pendingTickets.find(t => t.type === button.id);
              if (eligibleTicket) {
                  ticketToCall = eligibleTicket;
                  globalForStore.callCounters[button.id] = callCount + 1;
                  foundTicket = true;
                  break;
              }
          }
      }

      if (!foundTicket) {
          Object.keys(globalForStore.callCounters).forEach(key => globalForStore.callCounters[key] = 0);
          for (const button of sortedButtons) {
              const eligibleTicket = pendingTickets.find(t => t.type === button.id);
              if (eligibleTicket) {
                  ticketToCall = eligibleTicket;
                  globalForStore.callCounters[button.id] = 1;
                  break;
              }
          }
      }
      
      if(!ticketToCall && pendingTickets.length > 0) {
        ticketToCall = pendingTickets.sort((a, b) => {
          const priorityA = globalForStore.settings.buttons.find(btn => btn.id === a.type)?.priority ?? 99;
          const priorityB = globalForStore.settings.buttons.find(btn => btn.id === b.type)?.priority ?? 99;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        })[0];
      }

    } else {
      ticketToCall = globalForStore.tickets
        .filter(t => !t.called)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
    }

    if (ticketToCall) {
      return markTicketAsCalled(ticketToCall);
    }

    return null;
  });
}

export async function callNextTicketByType(buttonId: string): Promise<Ticket | null> {
 return withLock(async () => {
    const ticketToCall = globalForStore.tickets
      .filter(t => !t.called && t.type === buttonId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

    if (ticketToCall) {
        return markTicketAsCalled(ticketToCall);
    }
    
    return null;
 });
}

export async function repeatLastCall(): Promise<Ticket | null> {
  return withLock(async () => {
    if (globalForStore.lastCalled) {
      // Pass the last called ticket directly
      return markTicketAsCalled(globalForStore.lastCalled, true);
    }
    return null;
  });
}

export async function getQueueStatus(): Promise<{ lastCalled: Ticket | null, history: Ticket[], videos: string[] }> {
  return Promise.resolve({
    lastCalled: globalForStore.lastCalled ? JSON.parse(JSON.stringify(globalForStore.lastCalled)) : null,
    history: JSON.parse(JSON.stringify(globalForStore.callHistory)),
    videos: globalForStore.settings.youtubeUrls,
  });
}

export async function getPendingTickets(): Promise<Ticket[]> {
    return Promise.resolve(JSON.parse(JSON.stringify(globalForStore.tickets.filter(t => !t.called))));
}
