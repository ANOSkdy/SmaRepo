import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasDatabaseUrl } from '@/lib/server-env';
import { getLogsBetween, summariseMonth } from '@/lib/calendar/neon';

export const runtime = 'nodejs';

function parseYearMonth(req: NextRequest): { year: number; month: number } | null {
  const { searchParams } = new URL(req.url);
  const yearValue = searchParams.get('year');
  const monthValue = searchParams.get('month');
  if (!yearValue || !monthValue) return null;

  if (!/^\d{4}$/.test(yearValue) || !/^(?:[1-9]|1[0-2])$/.test(monthValue)) {
    return null;
  }

  const year = Number.parseInt(yearValue, 10);
  const month = Number.parseInt(monthValue, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function buildMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const endExclusive = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { start, endExclusive };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  const parsed = parseYearMonth(req);
  if (!parsed) {
    return NextResponse.json({ error: 'INVALID_QUERY' }, { status: 400 });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  try {
    const range = buildMonthRange(parsed.year, parsed.month);
    const logs = await getLogsBetween({ fromDate: range.start, toDateExclusive: range.endExclusive });
    const days = summariseMonth(logs);
    return NextResponse.json({ year: parsed.year, month: parsed.month, days: days ?? [] });
  } catch {
    return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 });
  }
}
