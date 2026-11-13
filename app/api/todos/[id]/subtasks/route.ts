import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { subtaskDB, todoDB, type Subtask } from '@/lib/db';

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function parseTitle(body: unknown): { value: string } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Subtask title is required' };
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'title')) {
    return { error: 'Unknown field' };
  }
  if (typeof record.title !== 'string' || !record.title.trim()) {
    return { error: 'Subtask title is required' };
  }
  return { value: record.title.trim() };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const rateLimitResponse = checkApiRateLimit(request, 'write', session?.userId);
  if (rateLimitResponse) return rateLimitResponse;
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: rawId } = await params;
  const todoId = parseId(rawId);
  if (todoId === null || !todoDB.findByIdForUser(todoId, session.userId)) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const parsed = parseTitle(await readJson(request));
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const subtask: Subtask = subtaskDB.create(todoId, { title: parsed.value });
  return NextResponse.json(subtask, { status: 201 });
}
