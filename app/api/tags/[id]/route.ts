import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';
import { readTagJson, rejectCrossOrigin, tagError, tagRouteId } from '@/lib/tag-api';
import { validateTag } from '@/lib/tag-validation';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const id = await tagRouteId(params);
  if (id === null || !tagDB.findById(id, session.userId)) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }
  const parsed = validateTag(await readTagJson(request), true);
  if ('error' in parsed) return NextResponse.json(parsed, { status: 400 });
  try {
    const tag = tagDB.update(id, session.userId, parsed.value);
    if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    return NextResponse.json(tag);
  } catch (error) {
    return tagError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const id = await tagRouteId(params);
  try {
    if (id === null || !tagDB.delete(id, session.userId)) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return tagError(error);
  }
}
