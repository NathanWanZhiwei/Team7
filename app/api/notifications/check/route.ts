import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  const rateLimitResponse = checkApiRateLimit(request, 'read', session?.userId);
  if (rateLimitResponse) return rateLimitResponse;
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
