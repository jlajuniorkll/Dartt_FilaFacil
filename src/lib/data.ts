
'use server';
import type { AppSettings, Ticket, DashboardStats, DailyQueue } from './types';
import { firestore } from './firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit, runTransaction, writeBatch, deleteDoc } from 'firebase/firestore';


// --- Firestore Document References ---
const settingsDocRef = doc(firestore, 'app/settings');
const getTodayDocRef = () => {
    // Format: YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    return doc(firestore, `dailyQueues/${today}`);
}
const getTicketsCollectionRef = () => collection(getTodayDocRef(), 'tickets');

const initialSettings: AppSettings = {
  buttons: [
    { id: 'btn-1', name: 'Preferencial', prefix: 'P', priority: 1, frequency: 2, startNumber: 1, color: '#5DADE2', textColor: '#FFFFFF' },
    { id: 'btn-2', name: 'Normal', prefix: 'N', priority: 2, frequency: 1, startNumber: 1, color: '#F39C12', textColor: '#FFFFFF' },
  ],
  youtubeUrls: [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=3Z1_p7-v7v8',
  ],
  priorityEnabled: true,
  counterConfiguration: 'none',
  totalCounters: 5,
};

// --- Settings Management (Firestore) ---
export async function getSettings(): Promise<AppSettings> {
  try {
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      const dbSettings = docSnap.data();
      return { ...initialSettings, ...dbSettings } as AppSettings;
    } else {
      await setDoc(settingsDocRef, initialSettings);
      return initialSettings;
    }
  } catch (error) {
    console.error("Error fetching settings from Firestore:", error);
    return initialSettings;
  }
}

export async function updateSettings(newSettings: AppSettings): Promise<AppSettings> {
   await setDoc(settingsDocRef, newSettings, { merge: true });
   return newSettings;
}

// --- Daily Queue Management (Firestore) ---

async function getTodaysQueue(): Promise<DailyQueue> {
    const todayDocRef = getTodayDocRef();
    const docSnap = await getDoc(todayDocRef);
    if(docSnap.exists()) {
        return docSnap.data() as DailyQueue;
    }
    // If it doesn't exist, create it
    const settings = await getSettings();
    const newQueue: DailyQueue = {
        lastCalled: null,
        callHistory: [],
        callCounters: Object.fromEntries(settings.buttons.map(b => [b.id, 0])),
    };
    await setDoc(todayDocRef, newQueue);
    return newQueue;
}

// --- Ticket Management (Firestore) ---

export async function generateTicket(buttonId: string): Promise<Ticket> {
  const settings = await getSettings();
  const button = settings.buttons.find(b => b.id === buttonId);
  if (!button) {
    throw new Error('Button configuration not found');
  }

  const todayDocRef = getTodayDocRef();
  let newTicket: Ticket | null = null;
  
  await runTransaction(firestore, async (transaction) => {
    const todayDoc = await transaction.get(todayDocRef);
    let sequenceCounters: { [key: string]: number } = {};

    if (!todayDoc.exists()) {
        // Initialize for all buttons with their start numbers if doc doesn't exist
        settings.buttons.forEach(btn => {
            sequenceCounters[btn.id] = (btn.startNumber || 1) - 1;
        });
    } else {
        sequenceCounters = todayDoc.data().sequenceCounters || {};
        // Ensure all buttons from settings have a counter, initialize if missing
        settings.buttons.forEach(btn => {
            if (sequenceCounters[btn.id] === undefined) {
                sequenceCounters[btn.id] = (btn.startNumber || 1) - 1;
            }
        });
    }

    const currentNumber = (sequenceCounters[buttonId] || (button.startNumber || 1) - 1) + 1;
    sequenceCounters[buttonId] = currentNumber;
    
    newTicket = {
        id: `ticket-${Date.now()}-${button.prefix}`,
        type: button.id,
        prefix: button.prefix,
        displayNumber: currentNumber,
        ticketNumber: `${button.prefix}${currentNumber.toString().padStart(3, '0')}`,
        timestamp: new Date().toISOString(),
        called: false,
    };
    
    const ticketDocRef = doc(getTicketsCollectionRef(), newTicket.id);
    transaction.set(ticketDocRef, newTicket);
    transaction.set(todayDocRef, { sequenceCounters }, { merge: true });
  });

  if (!newTicket) {
      throw new Error("Failed to create ticket within the transaction.");
  }
  
  revalidatePath('/call', 'page');
  revalidatePath('/dashboard', 'page');
  return newTicket;
}

async function markTicketAsCalled(ticketToCall: Ticket, counter: number | undefined, isRepeat = false): Promise<Ticket | null> {
    const todayDocRef = getTodayDocRef();

    await runTransaction(firestore, async (transaction) => {
        const todayDoc = await transaction.get(todayDocRef);
        if (!todayDoc.exists()) throw new Error("Today's queue document not found.");

        const queueData = todayDoc.data() as DailyQueue;
        
        let updatedTicketData = { ...ticketToCall };

        if (isRepeat) {
            if (!queueData.lastCalled) return; // Can't repeat if nothing was called
            updatedTicketData = { ...queueData.lastCalled };
            updatedTicketData.calledAt = new Date().toISOString(); // Update timestamp to trigger display
            updatedTicketData.isRepeat = true;
        } else {
            const ticketDocRef = doc(getTicketsCollectionRef(), ticketToCall.id);
            updatedTicketData.called = true;
            updatedTicketData.calledAt = new Date().toISOString();
            updatedTicketData.counter = counter;
            updatedTicketData.isRepeat = false;
            transaction.update(ticketDocRef, { called: true, calledAt: updatedTicketData.calledAt, counter });
        }
        
        const newHistory = [updatedTicketData, ...queueData.callHistory.filter(t => t.id !== updatedTicketData.id)].slice(0, 10);
        
        transaction.update(todayDocRef, {
            lastCalled: updatedTicketData,
            callHistory: newHistory,
        });

        // This is to pass the updated ticket out of the transaction
        ticketToCall = updatedTicketData;
    });
    
    revalidatePath('/call', 'page');
    revalidatePath('/dashboard', 'page');
    revalidatePath('/display', 'page');
    revalidatePath('/api/queue/status', 'route');

    return ticketToCall;
}

export async function callNextTicket(counter: number): Promise<Ticket | null> {
  const settings = await getSettings();
  const todaysQueue = await getTodaysQueue();
  const pendingTickets = await getPendingTickets(); // This already gets them sorted
  
  if (pendingTickets.length === 0) return null;

  let ticketToCall: Ticket | undefined;
    
  if (settings.priorityEnabled) {
      const sortedButtons = [...settings.buttons].sort((a, b) => a.priority - b.priority);
      const callCounters = todaysQueue.callCounters || {};
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

      if (!foundTicket) {
          // Reset counters and try again
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
      
      // Fallback to oldest ticket if logic doesn't find one but tickets exist
      if(!ticketToCall && pendingTickets.length > 0) {
        ticketToCall = pendingTickets[0];
      }
      
      // Persist updated call counters
      await setDoc(getTodayDocRef(), { callCounters }, { merge: true });

  } else {
      ticketToCall = pendingTickets[0];
  }

  if (ticketToCall) {
    return markTicketAsCalled(ticketToCall, counter);
  }

  return null;
}

export async function callNextTicketByType(buttonId: string, counter: number): Promise<Ticket | null> {
   const pendingTickets = await getPendingTickets();
   const ticketToCall = pendingTickets.find(t => t.type === buttonId);
   
   if (!ticketToCall) return null;
   
   return markTicketAsCalled(ticketToCall, counter);
}

export async function repeatLastCall(): Promise<Ticket | null> {
    const todaysQueue = await getTodaysQueue();
    if (todaysQueue.lastCalled) {
        return markTicketAsCalled(todaysQueue.lastCalled, undefined, true);
    }
    return null;
}

export async function getQueueStatus(): Promise<{ lastCalled: Ticket | null, history: Ticket[], videos: string[] }> {
  const settings = await getSettings();
  const todaysQueue = await getTodaysQueue();
  return {
    lastCalled: todaysQueue.lastCalled,
    history: todaysQueue.callHistory,
    videos: settings.youtubeUrls,
  };
}

export async function getPendingTickets(): Promise<Ticket[]> {
    const ticketsQuery = query(getTicketsCollectionRef(), where("called", "==", false));
    const pendingTicketsSnap = await getDocs(ticketsQuery);
    const tickets = pendingTicketsSnap.docs.map(d => d.data() as Ticket);
    // Sort in application code instead of query
    tickets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return tickets;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const settings = await getSettings();
  
  const ticketsSnap = await getDocs(getTicketsCollectionRef());
  const allTicketsToday = ticketsSnap.docs.map(d => d.data() as Ticket);

  const calledToday = allTicketsToday.filter(t => t.called);
  const waiting = allTicketsToday.filter(t => !t.called);

  const ticketsByType = settings.buttons.map(button => {
    const count = allTicketsToday.filter(t => t.type === button.id).length;
    return {
      name: button.name,
      count: count,
      fill: button.color
    };
  });

  return {
    totalIssued: allTicketsToday.length,
    totalCalled: calledToday.length,
    waitingCount: waiting.length,
    ticketsByType,
  };
}

export async function resetQueue(): Promise<void> {
    const todayDocRef = getTodayDocRef();
    const ticketsQuery = query(getTicketsCollectionRef());
    const ticketsSnap = await getDocs(ticketsQuery);
    
    const batch = writeBatch(firestore);

    // Delete all ticket subcollection documents
    ticketsSnap.forEach(doc => {
        batch.delete(doc.ref);
    });

    // Reset the daily queue document itself
    const settings = await getSettings();
    const newQueue: DailyQueue = {
        lastCalled: null,
        callHistory: [],
        callCounters: Object.fromEntries(settings.buttons.map(b => [b.id, 0])),
        sequenceCounters: Object.fromEntries(settings.buttons.map(b => [b.id, (b.startNumber || 1) -1 ])),
    };
    batch.set(todayDocRef, newQueue);

    await batch.commit();
}
