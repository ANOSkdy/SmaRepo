export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { computeDailyAttendance } from '@/lib/report/work/attendance/computeDailyAttendance';
import { isBreakPolicyEnabled, resolveBreakPolicy } from '@/lib/policies/breakDeduction';
import { fetchAttendanceSessions } from '@/lib/report/work/attendance/sessions';
import { resolveSiteName } from '@/lib/report/work/attendance/siteUtils';
import { normalizeSession } from '@/lib/report/work/attendance/normalize';
import { auth } from '@/lib/auth';
import { hasDatabaseUrl } from '@/lib/server-env';

function parseDateParam(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseNumberParam(value: string | null, label: string): number | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number`);
  }
  return parsed;
}

export async function GET(req: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = parseDateParam(searchParams.get('date'));
  const siteId = searchParams.get('siteId') || undefined;
  const siteName = searchParams.get('siteName') || undefined;

  if (!dateParam) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD format' }, { status: 400 });
  }

  let userId: number | null = null;
  let machineId: number | null = null;
  try {
    const userParam = searchParams.get('user') ?? searchParams.get('userId');
    userId = parseNumberParam(userParam, 'user');
    machineId = parseNumberParam(searchParams.get('machineId'), 'machineId');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid params';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (userId == null) {
    return NextResponse.json({ error: 'user is required' }, { status: 400 });
  }

  try {
    const resolvedSiteName = await resolveSiteName(siteId, siteName);
    if (siteId && !siteName && !resolvedSiteName) {
      return NextResponse.json(
        { message: 'siteId not found', details: { siteId } },
        { status: 404 },
      );
    }
    const sessions = (await fetchAttendanceSessions({
      startDate: dateParam,
      endDate: dateParam,
      userId,
      siteName: resolvedSiteName ?? undefined,
      machineId: machineId != null ? String(machineId) : null,
    })).map(normalizeSession);

    const policy = await resolveBreakPolicy({
      userId,
      userRecordId: sessions.find((session) => session.userRecordId)?.userRecordId ?? null,
      userName: sessions.find((session) => session.userName)?.userName ?? null,
    });
    const breakPolicyApplied = isBreakPolicyEnabled() && !policy.excludeBreakDeduction;
    const calculation = computeDailyAttendance(sessions, {
      skipStandardBreakDeduction: !breakPolicyApplied,
    });
    const userName = sessions.find((session) => session.userName)?.userName ?? null;

    return NextResponse.json(
      {
        user: {
          userId,
          name: userName,
        },
        date: dateParam,
        sessions: sessions.map((session) => ({
          sessionId: session.id,
          start: session.start,
          end: session.end,
          durationMin: session.durationMin,
          siteName: session.siteName,
          machineId: session.machineId,
          machineName: session.machineName,
          workDescription: session.workDescription,
          status: session.status,
          statusNormalized: session.statusNormalized,
          statusRaw: session.statusRaw,
        })),
        calculation: {
          activeMinutes: calculation.activeMinutes,
          grossMinutes: calculation.grossMinutes,
          gapMinutes: calculation.gapMinutes,
          standardBreakMinutes: calculation.standardBreakMinutes,
          deductBreakMinutes: calculation.deductBreakMinutes,
          netMinutes: calculation.netMinutes,
          roundedMinutes: calculation.roundedMinutes,
          roundedHours: calculation.roundedHours,
          anomalies: calculation.anomalies,
          breakPolicyApplied: calculation.breakPolicyApplied,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[/api/report/work/attendance/day] error', error);
    const message = error instanceof Error ? error.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
