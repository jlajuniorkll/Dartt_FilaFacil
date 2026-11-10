'use server';

import * as data from './data';
import type { AppSettings, Ticket } from './types';
import { revalidatePath } from 'next/cache';
import { AuthError } from './db/auth-service';

export type ActionSuccess<T extends object = object> = {
  success: true;
} & T;

export type ActionFailure = {
  success: false;
  error: string;
  code?: string;
};

export type ActionOutcome<T extends object = object> =
  | ActionSuccess<T>
  | ActionFailure;

function toActionResult(error: unknown): ActionFailure {
  if (error instanceof AuthError) {
    // Mensagens seguras e específicas (não vazam detalhes internos).
    return { success: false, error: error.message, code: error.code };
  }
  console.error('Erro interno na operação:', error);
  return { success: false, error: 'Erro interno do servidor.' };
}

export async function updateSettings(
  settings: AppSettings
): Promise<ActionOutcome> {
  try {
    await data.updateSettings(settings);
    revalidatePath('/settings', 'page');
    revalidatePath('/request', 'page');
    revalidatePath('/call', 'page');
    return { success: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function generateTicket(
  buttonId: string
): Promise<ActionOutcome<{ ticket: Ticket }>> {
  try {
    const ticket = await data.generateTicket(buttonId);
    return { success: true, ticket };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function callNextTicket(
  counter: number
): Promise<ActionOutcome<{ ticket: Ticket | null }>> {
  try {
    const ticket = await data.callNextTicket(counter);
    return { success: true, ticket };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function callNextTicketByType(
  buttonId: string,
  counter: number
): Promise<ActionOutcome<{ ticket: Ticket | null }>> {
  try {
    const ticket = await data.callNextTicketByType(buttonId, counter);
    return { success: true, ticket };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function repeatLastCall(): Promise<ActionOutcome<{ ticket: Ticket | null }>> {
  try {
    const ticket = await data.repeatLastCall();
    return { success: true, ticket };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function resetQueue(): Promise<ActionOutcome> {
  try {
    await data.resetQueue();
    revalidatePath('/', 'layout'); // Revalidates all pages
    return { success: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function resetSequenceCounters(): Promise<ActionOutcome> {
  try {
    await data.resetSequenceCounters();
    revalidatePath('/settings', 'page');
    return { success: true };
  } catch (error) {
    return toActionResult(error);
  }
}
