import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { deleteSession, getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getSession();
  const rateLimitResponse = checkApiRateLimit(request, 'write', session?.userId);
  if (rateLimitResponse) return rateLimitResponse;
  await deleteSession();
  return NextResponse.json({ success: true });
}
