import { NextRequest, NextResponse } from 'next/server';
import { TagNotFoundError } from './db';

export async function readTagJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function tagRouteId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const number = Number(id);
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(number) ? number : null;
}

export function tagError(error: unknown): NextResponse {
  if (error instanceof TagNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof Error && 'code' in error &&
      error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
      error.message.includes('tags.user_id, tags.name')) {
    return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
  }
  console.error('Tag operation failed:', error);
  return NextResponse.json({ error: 'Could not save tag changes' }, { status: 500 });
}

export function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  if ((origin && origin !== request.nextUrl.origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  return null;
}
