import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getDatabaseHealth } from '@/lib/health';
import { createRequestLogger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestLogger = createRequestLogger(request);
  const session = await auth();

  if (!session?.user) {
    requestLogger.warn('health.unauthorized');
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getDatabaseHealth();
  const ok = db.ok;

  requestLogger.info('health.checked', {
    ok,
    services: {
      db: {
        ok: db.ok,
        connected: db.connected,
      },
    },
  });

  return NextResponse.json(
    {
      ok,
      services: {
        db: {
          ok: db.ok,
          connected: db.connected,
          tables: db.tables,
          columns: db.columns,
          error: db.error,
        },
      },
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 500 },
  );
}
