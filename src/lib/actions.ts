'use server';

import * as data from './data';
import type { AppSettings } from './types';
import { revalidatePath } from 'next/cache';

export async function updateSettings(settings: AppSettings) {
  try {
    await data.updateSettings(settings);
    // Revalidate specific paths that depend on settings
    revalidatePath('/settings');
    revalidatePath('/request');
    revalidatePath('/call');
    revalidatePath('/display');
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

export async function callNextTicket() {
    try {
        const ticket = await data.callNextTicket();
        return { success: true, ticket };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function callNextTicketByType(buttonId: string) {
    try {
        const ticket = await data.callNextTicketByType(buttonId);
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
