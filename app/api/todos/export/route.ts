import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { exportFilename, toCsv, toExportPayload } from '@/lib/export-import';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  const limited = checkApiRateLimit(request, 'read', session?.userId);
  if (limited) return limited;
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') {
    return NextResponse.json({ error: 'Export format must be json or csv' }, { status: 400 });
  }
  try {
    const todos = todoDB.findAllByUser(session.userId);
    const now = getSingaporeNow();
    return new NextResponse(
      format === 'csv' ? toCsv(todos) : JSON.stringify(toExportPayload(todos, now), null, 2),
      { headers: {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(format, now)}"`,
        'Cache-Control': 'no-store',
      } },
    );
  } catch (error) {
    console.error('Todo export failed:', error);
    return NextResponse.json({ error: 'Failed to export todos' }, { status: 500 });
  }
}
