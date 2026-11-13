import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { isReminderMinutes } from '@/lib/reminder-options';
import { validateUpdateTodo } from '@/lib/todo-validation';

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function getTodoId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) return null;
  const todoId = Number(id);
  return Number.isSafeInteger(todoId) ? todoId : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const rateLimitResponse = checkApiRateLimit(request, 'read', session?.userId);
  if (rateLimitResponse) return rateLimitResponse;
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = await getTodoId(params);
  if (id === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  const todo = todoDB.findByIdForUser(id, session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(todo);
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
  const id = await getTodoId(params);
  if (id === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const body = await readJson(request);
  const existing = todoDB.findByIdForUser(id, session.userId);
  if (!existing) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const parsed = validateUpdateTodo(body, existing);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (
    parsed.value.completed === true &&
    !existing.completed &&
    existing.is_recurring
  ) {
    const reminderMinutes =
      parsed.value.reminder_minutes !== undefined
        ? parsed.value.reminder_minutes
        : existing.reminder_minutes;
    if (reminderMinutes !== null && !isReminderMinutes(reminderMinutes)) {
      return NextResponse.json(
        {
          error:
            'Choose a supported reminder offset before completing this recurring todo.',
        },
        { status: 409 },
      );
    }
  }
  if (parsed.value.reminder_minutes != null) {
    const dueDate =
      parsed.value.due_date !== undefined ? parsed.value.due_date : existing.due_date;
    if (!dueDate) {
      return NextResponse.json(
        { error: 'A due date is required to set a reminder' },
        { status: 400 },
      );
    }
  }
  const result = todoDB.updateWithRecurrenceForUser(id, session.userId, parsed.value);
  if (!result) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const rateLimitResponse = checkApiRateLimit(request, 'write', session?.userId);
  if (rateLimitResponse) return rateLimitResponse;
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = await getTodoId(params);
  if (id === null || !todoDB.deleteForUser(id, session.userId)) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
