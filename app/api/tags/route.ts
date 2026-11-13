import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';
import { readTagJson, rejectCrossOrigin, tagError } from '@/lib/tag-api';
import { validateTag } from '@/lib/tag-validation';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(tagDB.findAllByUser(session.userId));
  } catch (error) {
    return tagError(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const parsed = validateTag(await readTagJson(request));
  if ('error' in parsed) return NextResponse.json(parsed, { status: 400 });
  try {
    return NextResponse.json(tagDB.create(session.userId, parsed.value), { status: 201 });
  } catch (error) {
    return tagError(error);
  }
}
