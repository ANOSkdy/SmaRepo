import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasDatabaseUrl } from '@/lib/server-env';
import { buildDayDetail, getLogsBetween } from '@/lib/calendar/neon';

export const runtime = 'nodejs';

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function isValidDateString(date: string): boolean {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!matched) return false;
  const [, y, m, d] = matched;
  const year = Number.parseInt(y, 10);
  const month = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() + 1 === month && utc.getUTCDate() === day
  );
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map((v) => Number.parseInt(v, 10));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function normalizeLookupText(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeLookupText(entry);
      if (normalized) return normalized;
    }
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMachineId(value: unknown): string | null {
  const trimmed = normalizeLookupText(value);
  if (!trimmed) return null;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') {
            const normalized = normalizeMachineId(item);
            if (normalized) return normalized;
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  const [first] = trimmed.split(',');
  const normalized = first.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 401);
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) return errorResponse('MISSING_DATE', 400);
  if (!isValidDateString(date)) return errorResponse('INVALID_DATE', 400);

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  try {
    const logs = await getLogsBetween({ fromDate: date, toDateExclusive: nextDate(date) });
    const { sessions } = buildDayDetail(logs);
    const logById = new Map(logs.map((log) => [log.id, log] as const));

    const readLookup = (
      fields: Record<string, unknown> | undefined,
      candidates: readonly string[],
      normalizer: (value: unknown) => string | null,
    ): string | null => {
      if (!fields) return null;
      for (const key of candidates) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        const normalized = normalizer(fields[key]);
        if (normalized) return normalized;
      }
      return null;
    };

    const userLookupCandidates = ['name (from user)', 'userName (from user)', 'userName', 'username'] as const;
    const machineLookupCandidates = [
      'machineId',
      'machineid',
      'machineId (from machine)',
      'machineid (from machine)',
    ] as const;
    const machineNameLookupCandidates = [
      'machineName',
      'machinename',
      'machineName (from machine)',
      'machinename (from machine)',
    ] as const;

    const sessionsWithLookup = sessions.map((entry) => {
      const startLog = logById.get(entry.startLogId);
      const endLog = entry.endLogId ? logById.get(entry.endLogId) : undefined;

      const userName =
        readLookup(startLog?.rawFields, userLookupCandidates, normalizeLookupText) ??
        readLookup(endLog?.rawFields, userLookupCandidates, normalizeLookupText) ??
        entry.userName;

      const machineId =
        readLookup(startLog?.rawFields, machineLookupCandidates, normalizeMachineId) ??
        readLookup(endLog?.rawFields, machineLookupCandidates, normalizeMachineId) ??
        normalizeMachineId(entry.machineId) ??
        null;

      const machineName =
        normalizeLookupText(startLog?.machineName) ??
        readLookup(startLog?.rawFields, machineNameLookupCandidates, normalizeLookupText) ??
        readLookup(endLog?.rawFields, machineNameLookupCandidates, normalizeLookupText) ??
        normalizeLookupText(endLog?.machineName) ??
        null;

      return {
        ...entry,
        userName,
        machineId,
        machineName,
      };
    });

    return NextResponse.json({ date, sessions: sessionsWithLookup });
  } catch {
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
