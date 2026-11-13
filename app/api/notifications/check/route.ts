import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const data = todoDB.findDueRemindersForUser(session.userId);
  return NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
