import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { validateCreateTodo, validatePriority } from '@/lib/todo-validation';
import { rejectCrossOrigin, tagError } from '@/lib/tag-api';

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const todos = todoDB.findAllByUser(session.userId);
  const priority = request.nextUrl.searchParams.get('priority');
  if (priority === null) return NextResponse.json(todos);

  const parsedPriority = validatePriority(priority);
  if ('error' in parsedPriority) {
    return NextResponse.json({ error: parsedPriority.error }, { status: 400 });
  }
  return NextResponse.json(todos.filter((todo) => todo.priority === parsedPriority.value));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await readJson(request);
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const parsed = validateCreateTodo(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    return NextResponse.json(todoDB.create(session.userId, parsed.value), { status: 201 });
  } catch (error) {
    return tagError(error);
  }
}
