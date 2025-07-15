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
  revalidatePath('/', 'layout');
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
  revalidatePath('/call');
  return JSON.parse(JSON.stringify(newTicket));
}

export async function callNextTicket(): Promise<Ticket | null> {
  let ticketToCall: Ticket | undefined;
  
  if (settings.priorityEnabled) {
    const pendingTickets = tickets.filter(t => !t.called);
    const sortedButtons = [...settings.buttons].sort((a, b) => a.priority - b.priority);

    for (const button of sortedButtons) {
        const eligibleTicket = pendingTickets.find(t => t.type === button.id);
        if (eligibleTicket) {
          const callCount = callCounters[button.id] || 0;
          if (callCount < button.frequency) {
            ticketToCall = eligibleTicket;
            callCounters[button.id] = callCount + 1;
            break;
          }
        }
    }

    // If no priority ticket was called, reset counters and call the highest priority
    if (!ticketToCall && pendingTickets.length > 0) {
        Object.keys(callCounters).forEach(key => callCounters[key] = 0);
        const highestPriorityButton = sortedButtons[0];
        ticketToCall = pendingTickets.find(t => t.type === highestPriorityButton.id);
        if (ticketToCall) {
          callCounters[highestPriorityButton.id] = 1;
        }
    }
    
    // Fallback to first available if logic fails
    if(!ticketToCall) {
      ticketToCall = pendingTickets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
    }

  } else {
    // FIFO
    ticketToCall = tickets
      .filter(t => !t.called)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
  }

  if (ticketToCall) {
    ticketToCall.called = true;
    ticketToCall.calledAt = new Date().toISOString();
    lastCalled = ticketToCall;
    callHistory.unshift(ticketToCall);
    if (callHistory.length > 10) {
      callHistory.pop();
    }
  }

  revalidatePath('/call');
  revalidatePath('/display');
  return lastCalled ? JSON.parse(JSON.stringify(lastCalled)) : null;
}

export async function callNextTicketByType(buttonId: string): Promise<Ticket | null> {
  const ticketToCall = tickets
    .filter(t => !t.called && t.type === buttonId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

  if (ticketToCall) {
    ticketToCall.called = true;
    ticketToCall.calledAt = new Date().toISOString();
    lastCalled = ticketToCall;
    callHistory.unshift(ticketToCall);
    if (callHistory.length > 10) {
      callHistory.pop();
    }
  }

  revalidatePath('/call');
  revalidatePath('/display');
  return lastCalled ? JSON.parse(JSON.stringify(lastCalled)) : null;
}


export async function repeatLastCall(): Promise<Ticket | null> {
  // This action doesn't change data, just retrieves it.
  // We can add a "re-called" sound effect on the frontend.
  revalidatePath('/display'); // To trigger a potential visual effect
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
    return Promise.resolve(tickets.filter(t => !t.called));
}
