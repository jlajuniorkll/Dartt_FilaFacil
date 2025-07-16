
'use server';

import * as data from './data';
import type { AppSettings } from './types';
import { revalidatePath } from 'next/cache';

export async function updateSettings(settings: AppSettings) {
  try {
    await data.updateSettings(settings);
    revalidatePath('/settings', 'page');
    revalidatePath('/request', 'page');
    revalidatePath('/call', 'page');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function generateTicket(buttonId: string) {
  try {
    const ticket = await data.generateTicket(buttonId);
    return { success: true, ticket };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function callNextTicket(counter: number) {
    try {
        const ticket = await data.callNextTicket(counter);
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function callNextTicketByType(buttonId: string, counter: number) {
    try {
        const ticket = await data.callNextTicketByType(buttonId, counter);
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}


export async function repeatLastCall() {
    try {
        const ticket = await data.repeatLastCall();
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function resetQueue() {
    try {
        await data.resetQueue();
        revalidatePath('/', 'layout'); // Revalidates all pages
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function resetSequenceCounters() {
    try {
        await data.resetSequenceCounters();
        revalidatePath('/settings', 'page');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
