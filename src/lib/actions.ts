'use server';

import * as data from './data';
import type { AppSettings } from './types';
import { revalidatePath } from 'next/cache';

export async function updateSettings(settings: AppSettings) {
  try {
    await data.updateSettings(settings);
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function generateTicket(buttonId: string) {
  try {
    const ticket = await data.generateTicket(buttonId);
    revalidatePath('/call', 'page');
    revalidatePath('/display', 'page');
    revalidatePath('/api/queue/status', 'route');
    return { success: true, ticket };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function callNextTicket() {
    try {
        const ticket = await data.callNextTicket();
        revalidatePath('/call', 'page');
        revalidatePath('/display', 'page');
        revalidatePath('/api/queue/status', 'route');
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function callNextTicketByType(buttonId: string) {
    try {
        const ticket = await data.callNextTicketByType(buttonId);
        revalidatePath('/call', 'page');
        revalidatePath('/display', 'page');
        revalidatePath('/api/queue/status', 'route');
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}


export async function repeatLastCall() {
    try {
        const ticket = await data.repeatLastCall();
        revalidatePath('/display', 'page');
        revalidatePath('/api/queue/status', 'route');
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
