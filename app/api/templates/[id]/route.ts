import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { templateDB } from '@/lib/db';
import { rejectCrossOrigin } from '@/lib/tag-api';
import { readTemplateJson, templateError, templateRouteId } from '@/lib/template-api';
import { validateUpdateTemplate } from '@/lib/template-validation';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const limited = checkApiRateLimit(request, 'write', session.userId);
  if (limited) return limited;
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const id = await templateRouteId(params);
  if (id === null) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  try {
    const current = templateDB.findByIdForUser(id, session.userId);
    if (!current) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    const parsed = validateUpdateTemplate(await readTemplateJson(request), current);
    if ('error' in parsed) return NextResponse.json(parsed, { status: 400 });
    const updated = templateDB.update(id, session.userId, parsed.value);
    if (!updated) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return templateError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const limited = checkApiRateLimit(request, 'write', session.userId);
  if (limited) return limited;
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const id = await templateRouteId(params);
  try {
    if (id === null || !templateDB.deleteForUser(id, session.userId)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return templateError(error);
  }
}
