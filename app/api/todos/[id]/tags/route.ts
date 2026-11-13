import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';
import { readTagJson, rejectCrossOrigin, tagError, tagRouteId } from '@/lib/tag-api';
import { validateTagIds } from '@/lib/tag-validation';

type Context = { params: Promise<{ id: string }> };

async function changeTag(request: NextRequest, { params }: Context, attach: boolean) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const id = await tagRouteId(params);
  if (id === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  const body = await readTagJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !('tag_id' in body) || Object.keys(body).length !== 1) {
    return NextResponse.json({ error: 'tag_id is required' }, { status: 400 });
  }
  const parsed = validateTagIds([body.tag_id]);
  if ('error' in parsed) return NextResponse.json({ error: 'Invalid tag_id' }, { status: 400 });
  try {
    if (attach) tagDB.attachToTodo(id, parsed.value[0], session.userId);
    else tagDB.detachFromTodo(id, parsed.value[0], session.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return tagError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  return changeTag(request, context, true);
}

export async function DELETE(request: NextRequest, context: Context) {
  return changeTag(request, context, false);
}
