import { NextRequest, NextResponse } from 'next/server';
import { getLogsBetween } from '@/lib/calendar/neon';
import { hasDatabaseUrl } from '@/lib/server-env';
import { logEvent, newErrorId, toErrorMeta } from '@/lib/diagnostics';

export const runtime = 'nodejs';

function isValidDateString(date: string): boolean {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!matched) return false;
  const [, y, m, d] = matched;
  const year = Number.parseInt(y, 10);
  const month = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() + 1 === month && utc.getUTCDate() === day;
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map((v) => Number.parseInt(v, 10));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const errorId = newErrorId();
  const debugToken = process.env.DEBUG_TOKEN;

  if (!debugToken) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  if (req.headers.get('x-debug-token') !== debugToken) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED', errorId }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');

  if (!fromDate || !toDate || !isValidDateString(fromDate) || !isValidDateString(toDate)) {
    return NextResponse.json({ ok: false, error: 'INVALID_QUERY', errorId }, { status: 400 });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB_ENV_MISSING', errorId }, { status: 500 });
  }

  try {
    const logs = await getLogsBetween({ fromDate, toDateExclusive: nextDate(toDate) });
    const activeUsers = new Set(logs.map((log) => log.userId ?? log.userName ?? 'unknown')).size;
    const uniqueSites = new Set(logs.map((log) => log.siteName).filter((name): name is string => Boolean(name))).size;

    logEvent('info', 'debug_calendar_success', {
      errorId,
      fromDate,
      toDate,
      rowCount: logs.length,
      activeUsers,
      uniqueSites,
    });

    return NextResponse.json({
      ok: true,
      connected: true,
      range: { fromDate, toDate },
      counts: {
        logsInRange: logs.length,
        activeUsers,
        uniqueSites,
      },
    });
  } catch (error) {
    logEvent('error', 'debug_calendar_error', {
      errorId,
      fromDate,
      toDate,
      ...toErrorMeta(error),
    });
    return NextResponse.json({ ok: false, error: 'DEBUG_CALENDAR_FAILED', errorId }, { status: 500 });
  }
}
