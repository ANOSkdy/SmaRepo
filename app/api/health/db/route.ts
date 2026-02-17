import { NextResponse } from 'next/server';

import { query } from '@/lib/db';
import { hasDatabaseUrl } from '@/lib/server-env';

export const runtime = 'nodejs';

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  try {
    await query('SELECT $1::int as ok', [1]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'DB connection failed' }, { status: 500 });
  }
}
