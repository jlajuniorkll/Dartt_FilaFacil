import type { AppSettings, ButtonConfig, Ticket } from './types';
import { revalidatePath } from 'next/cache';

// In-memory store
let settings: AppSettings = {
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

let tickets: Ticket[] = [];
const sequenceCounters: { [key: string]: number } = {
  'btn-1': 0,
  'btn-2': 0,
};

const callCounters: { [key: string]: number } = {
  'btn-1': 0,
  'btn-2': 0,
};
let lastCalled: Ticket | null = null;
const callHistory: Ticket[] = [];

// --- Settings Management ---
export async function getSettings(): Promise<AppSettings> {
  return Promise.resolve(JSON.parse(JSON.stringify(settings)));
}

export async function updateSettings(newSettings: AppSettings): Promise<AppSettings> {
  settings = JSON.parse(JSON.stringify(newSettings));
  // Ensure counters exist for new buttons
  settings.buttons.forEach(btn => {
    if (!sequenceCounters[btn.id]) {
      sequenceCounters[btn.id] = 0;
    }
    if (!callCounters[btn.id]) {
      callCounters[btn.id] = 0;
    }
  });
  return getSettings();
}

// --- Ticket Management ---

export async function generateTicket(buttonId: string): Promise<Ticket> {
  const button = settings.buttons.find(b => b.id === buttonId);
  if (!button) {
    throw new Error('Button configuration not found');
  }

  sequenceCounters[buttonId] = (sequenceCounters[buttonId] || 0) + 1;
  const newTicket: Ticket = {
    id: `ticket-${Date.now()}`,
    type: button.id,
    prefix: button.prefix,
    displayNumber: sequenceCounters[buttonId],
    ticketNumber: `${button.prefix}${sequenceCounters[buttonId].toString().padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    called: false,
  };

  tickets.push(newTicket);
  return JSON.parse(JSON.stringify(newTicket));
}

export async function callNextTicket(): Promise<Ticket | null> {
  let ticketToCall: Ticket | undefined;
  
  if (settings.priorityEnabled) {
    const pendingTickets = tickets.filter(t => !t.called);
    if (pendingTickets.length === 0) return null;

    const sortedButtons = [...settings.buttons].sort((a, b) => a.priority - b.priority);

    // Check if any priority group *should* be called based on frequency
    let foundTicket = false;
    for (const button of sortedButtons) {
        const callCount = callCounters[button.id] || 0;
        if (callCount < button.frequency) {
            const eligibleTicket = pendingTickets.find(t => t.type === button.id);
            if (eligibleTicket) {
                ticketToCall = eligibleTicket;
                callCounters[button.id] = callCount + 1;
                foundTicket = true;
                break;
            }
        }
    }

    // If no group was called (e.g., all met their frequency limit for the cycle), reset and call the highest priority available
    if (!foundTicket) {
        Object.keys(callCounters).forEach(key => callCounters[key] = 0);
        for (const button of sortedButtons) {
            const eligibleTicket = pendingTickets.find(t => t.type === button.id);
            if (eligibleTicket) {
                ticketToCall = eligibleTicket;
                callCounters[button.id] = 1;
                break;
            }
        }
    }
    
    // Fallback to first available if all logic above fails (should not happen if pendingTickets > 0)
    if(!ticketToCall && pendingTickets.length > 0) {
      ticketToCall = pendingTickets.sort((a, b) => {
        const priorityA = settings.buttons.find(btn => btn.id === a.type)?.priority ?? 99;
        const priorityB = settings.buttons.find(btn => btn.id === b.type)?.priority ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      })[0];
    }

  } else {
    // FIFO
    ticketToCall = tickets
      .filter(t => !t.called)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
  }

  if (ticketToCall) {
    // Mark as called *in the main tickets array*
    const originalTicket = tickets.find(t => t.id === ticketToCall!.id);
    if (originalTicket) {
        originalTicket.called = true;
        originalTicket.calledAt = new Date().toISOString();
        lastCalled = originalTicket;
        callHistory.unshift(originalTicket);
        if (callHistory.length > 10) {
          callHistory.pop();
        }
    }
  }

  return lastCalled ? JSON.parse(JSON.stringify(lastCalled)) : null;
}

export async function callNextTicketByType(buttonId: string): Promise<Ticket | null> {
  const ticketToCall = tickets
    .filter(t => !t.called && t.type === buttonId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

  if (ticketToCall) {
    const originalTicket = tickets.find(t => t.id === ticketToCall!.id);
     if (originalTicket) {
        originalTicket.called = true;
        originalTicket.calledAt = new Date().toISOString();
        lastCalled = originalTicket;
        callHistory.unshift(originalTicket);
        if (callHistory.length > 10) {
          callHistory.pop();
        }
    }
  }

  return lastCalled ? JSON.parse(JSON.stringify(lastCalled)) : null;
}


export async function repeatLastCall(): Promise<Ticket | null> {
  return lastCalled ? JSON.parse(JSON.stringify(lastCalled)) : null;
}

export async function getQueueStatus(): Promise<{ lastCalled: Ticket | null, history: Ticket[], videos: string[] }> {
  return Promise.resolve({
    lastCalled: lastCalled ? JSON.parse(JSON.stringify(lastCalled)) : null,
    history: JSON.parse(JSON.stringify(callHistory)),
    videos: settings.youtubeUrls,
  });
}

export async function getPendingTickets(): Promise<Ticket[]> {
    return Promise.resolve(JSON.parse(JSON.stringify(tickets.filter(t => !t.called))));
}
