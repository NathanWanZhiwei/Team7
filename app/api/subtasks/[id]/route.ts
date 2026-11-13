import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { subtaskDB, type UpdateSubtaskDto } from '@/lib/db';

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

function parseUpdate(body: unknown): { value: UpdateSubtaskDto } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid subtask update' };
  }

  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'title' && key !== 'completed')) {
    return { error: 'Unknown field' };
  }

  const value: UpdateSubtaskDto = {};
  if ('title' in record) {
    if (typeof record.title !== 'string' || !record.title.trim()) {
      return { error: 'Subtask title cannot be empty' };
    }
    value.title = record.title.trim();
  }
  if ('completed' in record) {
    if (typeof record.completed !== 'boolean') {
      return { error: 'Subtask completion must be a boolean' };
    }
    value.completed = record.completed;
  }
  if (Object.keys(value).length === 0) {
    return { error: 'At least one field is required' };
  }
  return { value };
}

export async function PUT(
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
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  const parsed = parseUpdate(await readJson(request));
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const subtask = subtaskDB.updateForUser(id, session.userId, parsed.value);
  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }
  return NextResponse.json(subtask);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const rateLimitResponse = checkApiRateLimit(_request, 'write', session?.userId);
  if (rateLimitResponse) return rateLimitResponse;
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null || !subtaskDB.deleteForUser(id, session.userId)) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
