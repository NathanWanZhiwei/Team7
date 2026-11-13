import { NextRequest, NextResponse } from 'next/server';

export async function readTemplateJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function templateRouteId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const number = Number(id);
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(number) ? number : null;
}

export function templateError(error: unknown): NextResponse {
  console.error('Template operation failed:', error);
  return NextResponse.json({ error: 'Could not save template changes' }, { status: 500 });
}
