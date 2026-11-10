import { getQueueStatus } from '@/lib/data';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const status = await getQueueStatus();
        return NextResponse.json(status);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch queue status' }, { status: 500 });
    }
}
