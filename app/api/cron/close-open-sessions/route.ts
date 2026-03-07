import { NextResponse } from 'next/server';
import { hasDatabaseUrl } from '@/lib/server-env';
import { forceCloseOpenSessionsByWorkDate } from '@/lib/services/sessions';

export const runtime = 'nodejs';

const JST_FORCED_TIME = process.env.FORCED_OUT_JST_TIME || '17:30';

function toYmdJst(date = new Date()) {
  const jstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === secret;
}

export async function GET(req: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateJst = searchParams.get('date') || toYmdJst();
  const dryRun = searchParams.get('dryRun') === '1';

  try {
    const closedCount = dryRun ? 0 : await forceCloseOpenSessionsByWorkDate(dateJst, JST_FORCED_TIME);
    return NextResponse.json({
      ok: true,
      dateJst,
      closedCount,
      dryRun,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
