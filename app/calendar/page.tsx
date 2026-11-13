import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { CalendarView } from '../ui/calendar-view';
import './calendar.css';

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <Suspense fallback={<p role="status">Loading calendar...</p>}>
      <CalendarView username={session.username} />
    </Suspense>
  );
}
