import { getQueueStatus } from '@/lib/data';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        revalidatePath(request.url);
        const status = await getQueueStatus();
        return NextResponse.json(status);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch queue status' }, { status: 500 });
    }
}
