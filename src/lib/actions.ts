'use server';

import * as data from './data';
import type { AppSettings } from './types';
import { revalidatePath } from 'next/cache';

export async function updateSettings(settings: AppSettings) {
  try {
    await data.updateSettings(settings);
    // Revalidate all paths that depend on settings
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function generateTicket(buttonId: string) {
  try {
    const ticket = await data.generateTicket(buttonId);
    // Revalidate pages to show new ticket in queue
    revalidatePath('/call', 'page');
    revalidatePath('/display', 'page');
    return { success: true, ticket };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function callNextTicket() {
    try {
        const ticket = await data.callNextTicket();
        // Revalidate pages to show updated queue and last called
        revalidatePath('/call', 'page');
        revalidatePath('/display', 'page');
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function callNextTicketByType(buttonId: string) {
    try {
        const ticket = await data.callNextTicketByType(buttonId);
        // Revalidate pages to show updated queue and last called
        revalidatePath('/call', 'page');
        revalidatePath('/display', 'page');
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}


export async function repeatLastCall() {
    try {
        const ticket = await data.repeatLastCall();
        // Revalidate only display, as queue does not change
        revalidatePath('/display', 'page');
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
