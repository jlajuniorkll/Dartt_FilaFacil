'use server';

import { revalidatePath } from 'next/cache';
import type { AppSettings, Ticket, DashboardStats } from './types';
import * as queue from './db/queue-service';
import { getCurrentUser } from './auth/authorization';
import { assertAdmin, assertOperatorOrAdmin } from './auth/guards';
import type { DateRange } from 'react-day-picker';

// Server-side data API for FilaFácil backed by SQLite (Fase 2C).
// Firestore is no longer used by this module. All functions are server
// actions: callers on the client receive thrown errors as rejections.
//
// Authorization:
// - Public (no session): getSettings, generateTicket, getQueueStatus
// - Operator or admin: getPendingTickets, callNextTicket, callNextTicketByType, repeatLastCall
// - Admin only: updateSettings, getDashboardStats, resetQueue, resetSequenceCounters
//
// Roles are always read from the SQLite session (cookie), never from the client.

export async function getSettings(): Promise<AppSettings> {
  return queue.getSettings();
}

export async function updateSettings(newSettings: AppSettings): Promise<AppSettings> {
  assertAdmin(await getCurrentUser());
  return queue.updateSettings(newSettings);
}

// --- Ticket Management ---

export async function generateTicket(buttonId: string): Promise<Ticket> {
  const ticket = await queue.generateTicket(buttonId);
  revalidatePath('/call', 'page');
  revalidatePath('/dashboard', 'page');
  return ticket;
}

export async function getPendingTickets(): Promise<Ticket[]> {
  assertOperatorOrAdmin(await getCurrentUser());
  return queue.getPendingTickets();
}

export async function getQueueStatus(): Promise<{
  lastCalled: Ticket | null;
  history: Ticket[];
  videos: string[];
}> {
  return queue.getQueueStatus();
}

export async function callNextTicket(counter: number): Promise<Ticket | null> {
  assertOperatorOrAdmin(await getCurrentUser());
  const ticket = await queue.callNextTicket(counter);
  revalidatePath('/call', 'page');
  revalidatePath('/dashboard', 'page');
  revalidatePath('/display', 'page');
  revalidatePath('/api/queue/status');
  return ticket;
}

export async function callNextTicketByType(buttonId: string, counter: number): Promise<Ticket | null> {
  assertOperatorOrAdmin(await getCurrentUser());
  const ticket = await queue.callNextTicketByType(buttonId, counter);
  revalidatePath('/call', 'page');
  revalidatePath('/dashboard', 'page');
  revalidatePath('/display', 'page');
  revalidatePath('/api/queue/status');
  return ticket;
}

export async function repeatLastCall(): Promise<Ticket | null> {
  assertOperatorOrAdmin(await getCurrentUser());
  const ticket = await queue.repeatLastCall();
  revalidatePath('/call', 'page');
  revalidatePath('/dashboard', 'page');
  revalidatePath('/display', 'page');
  revalidatePath('/api/queue/status');
  return ticket;
}

// --- Dashboard & Reporting ---

export async function getDashboardStats(dateRange: DateRange): Promise<DashboardStats> {
  assertAdmin(await getCurrentUser());
  return queue.getDashboardStats(dateRange);
}

// --- Reset ---

export async function resetQueue(): Promise<void> {
  assertAdmin(await getCurrentUser());
  await queue.resetQueue();
}

export async function resetSequenceCounters(): Promise<void> {
  assertAdmin(await getCurrentUser());
  await queue.resetSequenceCounters();
}
