import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { importSchema } from '@/lib/export-import';
import { rejectCrossOrigin } from '@/lib/tag-api';

export async function POST(request: NextRequest) {
  const session = await getSession();
  const limited = checkApiRateLimit(request, 'write', session?.userId);
  if (limited) return limited;
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Failed to import todos. Please check the file format.' },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ success: true, ...todoDB.importAll(session.userId, parsed.data.todos) });
  } catch (error) {
    console.error('Todo import failed:', error);
    return NextResponse.json({ error: 'Failed to import todos' }, { status: 500 });
  }
}
