
'use server';
import type { AppSettings, Ticket, DashboardStats, DailyQueue, ButtonConfig } from './types';
import { firestore } from './firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit, runTransaction, writeBatch, deleteDoc, updateDoc, collectionGroup } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, eachDayOfInterval, differenceInSeconds, addDays } from 'date-fns';

// --- Firestore Document References ---
const settingsDocRef = doc(firestore, 'app/settings');
const getDailyDocRef = (date: Date) => {
    // Format: YYYY-MM-DD
    const dateString = date.toISOString().split('T')[0];
    return doc(firestore, `dailyQueues/${dateString}`);
}
const getTodayDocRef = () => getDailyDocRef(new Date());

const getTicketsCollectionRefForDate = (date: Date) => collection(getDailyDocRef(date), 'tickets');
const getTicketsCollectionRef = () => getTicketsCollectionRefForDate(new Date());


const initialSettings: AppSettings = {
  buttons: [
    { id: 'btn-1', name: 'Preferencial', prefix: 'P', priority: 1, frequency: 2, automaticNumbering: true, startNumber: 1, color: '#5DADE2', textColor: '#FFFFFF' },
    { id: 'btn-2', name: 'Normal', prefix: 'N', priority: 2, frequency: 1, automaticNumbering: true, startNumber: 1, color: '#F39C12', textColor: '#FFFFFF' },
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
      // Ensure all buttons have the new automaticNumbering field
      const buttons = (dbSettings.buttons || []).map((b: any) => ({
        ...b,
        automaticNumbering: b.automaticNumbering ?? true,
      }));
      return { ...initialSettings, ...dbSettings, buttons } as AppSettings;
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
    
    const getInitialSequenceValue = (btn: ButtonConfig) => {
        return btn.automaticNumbering ? 0 : (btn.startNumber || 1) - 1;
    };

    let sequenceCounters: { [key: string]: number };
    if (!todayDoc.exists() || !todayDoc.data().sequenceCounters) {
        sequenceCounters = Object.fromEntries(settings.buttons.map(btn => [btn.id, getInitialSequenceValue(btn)]));
    } else {
        const existingData = todayDoc.data();
        sequenceCounters = existingData.sequenceCounters || {};
        settings.buttons.forEach(btn => {
            if (sequenceCounters[btn.id] === undefined) {
                sequenceCounters[btn.id] = getInitialSequenceValue(btn);
            }
        });
    }

    let currentSequence = sequenceCounters[buttonId] ?? getInitialSequenceValue(button);
    
    if (!button.automaticNumbering && button.startNumber) {
        if (currentSequence < (button.startNumber - 1)) {
            currentSequence = button.startNumber - 1;
        }
    }

    const newNumber = currentSequence + 1;
    sequenceCounters[buttonId] = newNumber;

    newTicket = {
        id: `ticket-${Date.now()}-${button.prefix}`,
        type: button.id,
        prefix: button.prefix,
        displayNumber: newNumber,
        ticketNumber: `${button.prefix}${newNumber.toString().padStart(3, '0')}`,
        timestamp: new Date().toISOString(),
        called: false,
    };

    const ticketDocRef = doc(getTicketsCollectionRef(), newTicket.id);
    transaction.set(ticketDocRef, newTicket);
    
    const dataToSet: Partial<DailyQueue> = { sequenceCounters };
    if (!todayDoc.exists()) {
        dataToSet.lastCalled = null;
        dataToSet.callHistory = [];
        dataToSet.callCounters = Object.fromEntries(settings.buttons.map(b => [b.id, 0]));
    }
    
    transaction.set(todayDocRef, dataToSet, { merge: true });
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
        
        const currentHistory = queueData.callHistory || [];
        const newHistory = [updatedTicketData, ...currentHistory.filter(t => t.id !== updatedTicketData.id)].slice(0, 10);
        
        transaction.update(todayDocRef, {
            lastCalled: updatedTicketData,
            callHistory: newHistory,
        });

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
  const pendingTickets = await getPendingTickets(); 
  
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
      
      if(!ticketToCall && pendingTickets.length > 0) {
        ticketToCall = pendingTickets[0];
      }
      
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
    history: todaysQueue.callHistory || [],
    videos: settings.youtubeUrls,
  };
}

export async function getPendingTickets(): Promise<Ticket[]> {
    const ticketsQuery = query(getTicketsCollectionRef(), where("called", "==", false));
    const pendingTicketsSnap = await getDocs(ticketsQuery);
    const tickets = pendingTicketsSnap.docs.map(d => d.data() as Ticket);
    tickets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return tickets;
}


// --- Dashboard & Reporting ---

function formatDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
  if (totalSeconds === 0) return "0s";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  let result = '';
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m `;
  if (seconds > 0 || result === '') result += `${seconds}s`;
  
  return result.trim();
}

async function getTicketsInDateRange(dateRange: DateRange): Promise<Ticket[]> {
    if (!dateRange || !dateRange.from) {
        const ticketsSnap = await getDocs(getTicketsCollectionRef());
        return ticketsSnap.docs.map(d => d.data() as Ticket);
    }

    const startDate = startOfDay(dateRange.from);
    const endDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);

    if (startDate > endDate) {
        return [];
    }
    
    const intervalDays = eachDayOfInterval({ start: startDate, end: endDate });

    const ticketPromises = intervalDays.map(day => {
        const dateString = day.toISOString().split('T')[0];
        const dailyDocRef = doc(firestore, `dailyQueues/${dateString}`);
        const ticketsCollectionRef = collection(dailyDocRef, 'tickets');
        return getDocs(ticketsCollectionRef);
    });
    
    const ticketSnapshots = await Promise.all(ticketPromises);
    
    const allTickets: Ticket[] = [];
    ticketSnapshots.forEach(snapshot => {
        snapshot.forEach(doc => {
            allTickets.push(doc.data() as Ticket);
        });
    });

    return allTickets;
}


export async function getDashboardStats(dateRange: DateRange): Promise<DashboardStats> {
  const settings = await getSettings();
  const allTicketsForPeriod = await getTicketsInDateRange(dateRange);

  // --- Calculations for the filtered period ---
  const calledTicketsForPeriod = allTicketsForPeriod.filter(t => t.called && t.calledAt);
  
  let totalServiceSeconds = 0;
  calledTicketsForPeriod.forEach(t => {
      totalServiceSeconds += differenceInSeconds(new Date(t.calledAt!), new Date(t.timestamp));
  });
  const averageServiceTimeInSeconds = calledTicketsForPeriod.length > 0 ? totalServiceSeconds / calledTicketsForPeriod.length : 0;
  
  const ticketsByType = settings.buttons.map(button => ({
    name: button.name,
    count: allTicketsForPeriod.filter(t => t.type === button.id).length,
    fill: button.color
  }));

  const calledByCounterMap: { [key: number]: number } = {};
  calledTicketsForPeriod.forEach(ticket => {
    if (ticket.counter) {
        calledByCounterMap[ticket.counter] = (calledByCounterMap[ticket.counter] || 0) + 1;
    }
  });
  
  const chartColors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  const ticketsByCounter = Object.entries(calledByCounterMap)
    .map(([counter, count], index) => ({
        counter: `Guichê ${counter}`,
        count,
        fill: chartColors[index % chartColors.length]
    }))
    .sort((a,b) => a.counter.localeCompare(b.counter));

  // --- Calculations for "now" (estimated wait time) ---
  const todaysWaitingTickets = await getPendingTickets();
  
  const todaysTicketsCollectionRef = getTicketsCollectionRefForDate(new Date());
  const todaysCalledQuery = query(todaysTicketsCollectionRef, where("called", "==", true));
  const todaysCalledTicketsSnap = await getDocs(todaysCalledQuery);
  const todaysCalledTickets = todaysCalledTicketsSnap.docs.map(d => d.data() as Ticket);


  let totalServiceSecondsToday = 0;
  todaysCalledTickets.forEach(t => {
      totalServiceSecondsToday += differenceInSeconds(new Date(t.calledAt!), new Date(t.timestamp));
  });
  const averageServiceTimeToday = todaysCalledTickets.length > 0 ? totalServiceSecondsToday / todaysCalledTickets.length : 0;
  const estimatedWaitSeconds = averageServiceTimeToday * todaysWaitingTickets.length;


  return {
    totalIssued: allTicketsForPeriod.length,
    totalCalled: calledTicketsForPeriod.length,
    waitingCount: todaysWaitingTickets.length, // This should always reflect the current queue
    averageServiceTime: formatDuration(averageServiceTimeInSeconds),
    estimatedWaitTime: formatDuration(estimatedWaitSeconds),
    ticketsByType,
    ticketsByCounter,
  };
}

export async function resetQueue(): Promise<void> {
    const todayDocRef = getTodayDocRef();
    const ticketsQuery = query(getTicketsCollectionRef());
    const ticketsSnap = await getDocs(ticketsQuery);
    
    const batch = writeBatch(firestore);

    ticketsSnap.forEach(doc => {
        batch.delete(doc.ref);
    });

    const settings = await getSettings();
    
    const getStartNumber = (btn: any) => {
        return btn.automaticNumbering ? 0 : (btn.startNumber || 1) - 1;
    };

    const newQueue: DailyQueue = {
        lastCalled: null,
        callHistory: [],
        callCounters: Object.fromEntries(settings.buttons.map(b => [b.id, 0])),
        sequenceCounters: Object.fromEntries(settings.buttons.map(b => [b.id, getStartNumber(b)])),
    };
    batch.set(todayDocRef, newQueue);

    await batch.commit();
}

export async function resetSequenceCounters(): Promise<void> {
    const todayDocRef = getTodayDocRef();
    const todayDocSnap = await getDoc(todayDocRef);

    if (!todayDocSnap.exists()) {
        return;
    }

    const settings = await getSettings();
    const getStartNumber = (btn: ButtonConfig) => {
        return btn.automaticNumbering ? 0 : (btn.startNumber || 1) - 1;
    };
    
    const initialSequenceCounters = Object.fromEntries(settings.buttons.map(b => [b.id, getStartNumber(b)]));

    await updateDoc(todayDocRef, {
        sequenceCounters: initialSequenceCounters,
    });
}


