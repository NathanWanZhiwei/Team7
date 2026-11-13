import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  const rateLimitResponse = checkApiRateLimit(request, 'read', session?.userId);
  if (rateLimitResponse) return rateLimitResponse;
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}
