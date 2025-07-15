import { getQueueStatus } from '@/lib/data';
import DisplayClient from './DisplayClient';
import { Suspense } from 'react';

export default async function DisplayPage() {
  const initialStatus = await getQueueStatus();

  return (
    <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-background"><p>Carregando...</p></div>}>
      <DisplayClient initialStatus={initialStatus} />
    </Suspense>
  );
}
