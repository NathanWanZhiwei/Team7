import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { templateDB } from '@/lib/db';
import { rejectCrossOrigin } from '@/lib/tag-api';
import { readTemplateJson, templateError } from '@/lib/template-api';
import { validateCreateTemplate } from '@/lib/template-validation';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const limited = checkApiRateLimit(request, 'read', session.userId);
  if (limited) return limited;
  try {
    return NextResponse.json(templateDB.findAllByUser(session.userId));
  } catch (error) {
    return templateError(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const limited = checkApiRateLimit(request, 'write', session.userId);
  if (limited) return limited;
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const parsed = validateCreateTemplate(await readTemplateJson(request));
  if ('error' in parsed) return NextResponse.json(parsed, { status: 400 });
  try {
    return NextResponse.json(templateDB.create(session.userId, parsed.value), { status: 201 });
  } catch (error) {
    return templateError(error);
  }
}
