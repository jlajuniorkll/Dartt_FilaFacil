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
  settings: globalForStore.settings ?? initialSettings,
  tickets: globalForStore.tickets ?? [],
  sequenceCounters: globalForStore.sequenceCounters ?? { 'btn-1': 0, 'btn-2': 0 },
  callCounters: globalForStore.callCounters ?? { 'btn-1': 0, 'btn-2': 0 },
  lastCalled: globalForStore.lastCalled ?? null,
  callHistory: globalForStore.callHistory ?? [],
};

if (process.env.NODE_ENV !== 'production') {
  globalForStore.settings = store.settings;
  globalForStore.tickets = store.tickets;
  globalForStore.sequenceCounters = store.sequenceCounters;
  globalForStore.callCounters = store.callCounters;
  globalForStore.lastCalled = store.lastCalled;
  globalForStore.callHistory = store.callHistory;
}


// --- Settings Management ---
export async function getSettings(): Promise<AppSettings> {
  return Promise.resolve(JSON.parse(JSON.stringify(store.settings)));
}

export async function updateSettings(newSettings: AppSettings): Promise<AppSettings> {
  store.settings = JSON.parse(JSON.stringify(newSettings));
  // Ensure counters exist for new buttons
  store.settings.buttons.forEach(btn => {
    if (!store.sequenceCounters[btn.id]) {
      store.sequenceCounters[btn.id] = 0;
    }
    if (!store.callCounters[btn.id]) {
      store.callCounters[btn.id] = 0;
    }
  });
  return getSettings();
}

// --- Ticket Management ---

export async function generateTicket(buttonId: string): Promise<Ticket> {
  const button = store.settings.buttons.find(b => b.id === buttonId);
  if (!button) {
    throw new Error('Button configuration not found');
  }

  store.sequenceCounters[buttonId] = (store.sequenceCounters[buttonId] || 0) + 1;
  const newTicket: Ticket = {
    id: `ticket-${Date.now()}`,
    type: button.id,
    prefix: button.prefix,
    displayNumber: store.sequenceCounters[buttonId],
    ticketNumber: `${button.prefix}${store.sequenceCounters[buttonId].toString().padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    called: false,
  };

  store.tickets.push(newTicket);
  return JSON.parse(JSON.stringify(newTicket));
}

export async function callNextTicket(): Promise<Ticket | null> {
  let ticketToCall: Ticket | undefined;
  
  if (store.settings.priorityEnabled) {
    const pendingTickets = store.tickets.filter(t => !t.called);
    if (pendingTickets.length === 0) return null;

    const sortedButtons = [...store.settings.buttons].sort((a, b) => a.priority - b.priority);

    // Check if any priority group *should* be called based on frequency
    let foundTicket = false;
    for (const button of sortedButtons) {
        const callCount = store.callCounters[button.id] || 0;
        if (callCount < button.frequency) {
            const eligibleTicket = pendingTickets.find(t => t.type === button.id);
            if (eligibleTicket) {
                ticketToCall = eligibleTicket;
                store.callCounters[button.id] = callCount + 1;
                foundTicket = true;
                break;
            }
        }
    }

    // If no group was called (e.g., all met their frequency limit for the cycle), reset and call the highest priority available
    if (!foundTicket) {
        Object.keys(store.callCounters).forEach(key => store.callCounters[key] = 0);
        for (const button of sortedButtons) {
            const eligibleTicket = pendingTickets.find(t => t.type === button.id);
            if (eligibleTicket) {
                ticketToCall = eligibleTicket;
                store.callCounters[button.id] = 1;
                break;
            }
        }
    }
    
    // Fallback to first available if all logic above fails (should not happen if pendingTickets > 0)
    if(!ticketToCall && pendingTickets.length > 0) {
      ticketToCall = pendingTickets.sort((a, b) => {
        const priorityA = store.settings.buttons.find(btn => btn.id === a.type)?.priority ?? 99;
        const priorityB = store.settings.buttons.find(btn => btn.id === b.type)?.priority ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      })[0];
    }

  } else {
    // FIFO
    ticketToCall = store.tickets
      .filter(t => !t.called)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
  }

  if (ticketToCall) {
    const originalTicket = store.tickets.find(t => t.id === ticketToCall!.id);
    if (originalTicket) {
        originalTicket.called = true;
        originalTicket.calledAt = new Date().toISOString();
        store.lastCalled = originalTicket;
        store.callHistory.unshift(originalTicket);
        if (store.callHistory.length > 10) {
          store.callHistory.pop();
        }
    }
  }

  return store.lastCalled ? JSON.parse(JSON.stringify(store.lastCalled)) : null;
}

export async function callNextTicketByType(buttonId: string): Promise<Ticket | null> {
  const ticketToCall = store.tickets
    .filter(t => !t.called && t.type === buttonId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

  if (ticketToCall) {
    const originalTicket = store.tickets.find(t => t.id === ticketToCall!.id);
     if (originalTicket) {
        originalTicket.called = true;
        originalTicket.calledAt = new Date().toISOString();
        store.lastCalled = originalTicket;
        store.callHistory.unshift(originalTicket);
        if (store.callHistory.length > 10) {
          store.callHistory.pop();
        }
    }
  }
   if (!ticketToCall) return null;
  return callNextTicket();
}


export async function repeatLastCall(): Promise<Ticket | null> {
  return store.lastCalled ? JSON.parse(JSON.stringify(store.lastCalled)) : null;
}

export async function getQueueStatus(): Promise<{ lastCalled: Ticket | null, history: Ticket[], videos: string[] }> {
  return Promise.resolve({
    lastCalled: store.lastCalled ? JSON.parse(JSON.stringify(store.lastCalled)) : null,
    history: JSON.parse(JSON.stringify(store.callHistory)),
    videos: store.settings.youtubeUrls,
  });
}

export async function getPendingTickets(): Promise<Ticket[]> {
    return Promise.resolve(JSON.parse(JSON.stringify(store.tickets.filter(t => !t.called))));
}
