import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { templateDB } from '@/lib/db';
import { rejectCrossOrigin } from '@/lib/tag-api';
import { templateError, templateRouteId } from '@/lib/template-api';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const limited = checkApiRateLimit(request, 'write', session.userId);
  if (limited) return limited;
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const id = await templateRouteId(params);
  if (id === null) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  try {
    const todo = templateDB.createTodoForUser(id, session.userId);
    if (!todo) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    return templateError(error);
  }
}
