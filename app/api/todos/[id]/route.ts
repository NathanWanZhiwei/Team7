import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { validateUpdateTodo } from '@/lib/todo-validation';
import { rejectCrossOrigin, tagError } from '@/lib/tag-api';

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
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
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = await getTodoId(params);
  if (id === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const body = await readJson(request);
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const parsed = validateUpdateTodo(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const todo = todoDB.updateForUser(id, session.userId, parsed.value);
    if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    return NextResponse.json(todo);
  } catch (error) {
    return tagError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = await getTodoId(params);
  if (id === null || !todoDB.deleteForUser(id, session.userId)) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
