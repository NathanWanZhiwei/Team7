import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { holidayDB } from '@/lib/db';
import { generateCalendarGrid } from '@/lib/calendar';

export async function GET(request: NextRequest) {
  const session = await getSession();
  const limited = checkApiRateLimit(request, 'read', session?.userId);
  if (limited) return limited;
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const year = request.nextUrl.searchParams.get('year');
  const month = request.nextUrl.searchParams.get('month');
  if (year === null && month === null) {
    return NextResponse.json({ holidays: holidayDB.findAll() });
  }
  if (!year || !/^[+-]?\d{1,6}$/.test(year) || !month || !/^\d{1,2}$/.test(month)) {
    return NextResponse.json({ error: 'Provide a valid year and month together' }, { status: 400 });
  }
  try {
    generateCalendarGrid(Number(year), Number(month));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return NextResponse.json({ error: 'Invalid calendar month' }, { status: 400 });
  }
  return NextResponse.json({ holidays: holidayDB.findByMonth(Number(year), Number(month)) });
}
