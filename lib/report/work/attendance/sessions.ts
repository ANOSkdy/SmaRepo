import { query } from '@/lib/db';
import type { NormalizedSessionStatus } from './normalize';

export type AttendanceSession = {
  id: string;
  date: string | null;
  start: string | null;
  end: string | null;
  startMs: number | null;
  endMs: number | null;
  durationMin: number | null;
  siteName: string | null;
  workDescription: string | null;
  userId: number | null;
  userRecordId: string | null;
  userName: string | null;
  machineId: string | null;
  machineName: string | null;
  status: string | null;
  statusNormalized?: NormalizedSessionStatus;
  statusRaw?: string | null;
};

export type AttendanceSessionQuery = {
  startDate: string;
  endDate: string;
  userId?: number | null;
  siteName?: string | null;
  machineId?: string | null;
};

type SessionPayloadRow = {
  payload: Record<string, unknown>;
};

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readFirstString(fields: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        const text = asString(entry);
        if (text) return text;
      }
      continue;
    }
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function toSessionRow(payload: Record<string, unknown>): AttendanceSession | null {
  const fields =
    payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)
      ? (payload.fields as Record<string, unknown>)
      : payload;

  const date = asString(fields.date);
  const start = readFirstString(fields, ['start', 'start (JST)']);
  const end = readFirstString(fields, ['end', 'end (JST)']);
  const durationMin = asNumber(fields.durationMin);
  const siteName = readFirstString(fields, ['siteName', 'site name', 'site']);
  const workDescription = readFirstString(fields, ['workDescription', 'work description']);
  const userRecordId = Array.isArray(fields.user) ? asString(fields.user[0]) : asString(fields.userRecordId);
  const userId = asNumber(fields.userId ?? fields.user);
  const userName = readFirstString(fields, ['name (from user)', 'userName', 'username', 'name']);
  const machineId = readFirstString(fields, ['machineId', 'machineid', 'machineId (from machine)']);
  const machineName = readFirstString(fields, ['machineName', 'machinename', 'machineName (from machine)']);
  const status = asString(fields.status);

  const startMs = start ? Date.parse(start) : Number.NaN;
  const endMs = end ? Date.parse(end) : Number.NaN;
  const normalizedStartMs = Number.isFinite(startMs) ? startMs : null;
  const normalizedEndMs = Number.isFinite(endMs) ? endMs : null;
  const computedDuration =
    normalizedStartMs != null && normalizedEndMs != null && normalizedEndMs > normalizedStartMs
      ? Math.round((normalizedEndMs - normalizedStartMs) / 60000)
      : null;

  return {
    id: asString(fields.id) ?? asString(payload.id) ?? `${date ?? 'session'}-${normalizedStartMs ?? 0}`,
    date,
    start,
    end,
    startMs: normalizedStartMs,
    endMs: normalizedEndMs,
    durationMin: durationMin ?? computedDuration,
    siteName,
    workDescription,
    userId,
    userRecordId,
    userName,
    machineId,
    machineName,
    status,
  };
}

function normalizeText(value: string | null | undefined): string | null {
  return value ? value.trim().toLocaleLowerCase('ja') : null;
}

function matchesQuery(row: AttendanceSession, query: AttendanceSessionQuery): boolean {
  if (query.userId != null && row.userId !== query.userId) return false;
  if (query.siteName) {
    const expected = normalizeText(query.siteName);
    const actual = normalizeText(row.siteName);
    if (expected && actual && expected !== actual) return false;
  }
  if (query.machineId) {
    const expected = normalizeText(query.machineId);
    const actual = normalizeText(row.machineId);
    if (expected && actual && expected !== actual) return false;
  }
  return true;
}

export async function fetchAttendanceSessions(queryParams: AttendanceSessionQuery): Promise<AttendanceSession[]> {
  const result = await query<SessionPayloadRow>(
    `
      SELECT to_jsonb(s) AS payload
      FROM sessions s
      WHERE COALESCE(to_jsonb(s)->>'date', '') >= $1
        AND COALESCE(to_jsonb(s)->>'date', '') <= $2
      ORDER BY
        COALESCE(to_jsonb(s)->>'date', '') ASC,
        COALESCE(to_jsonb(s)->>'start', '') ASC,
        COALESCE(to_jsonb(s)->>'id', '') ASC
    `,
    [queryParams.startDate, queryParams.endDate],
  );

  const rows = result.rows
    .map((row) => toSessionRow(row.payload))
    .filter((row): row is AttendanceSession => row !== null && row.date !== null)
    .filter((row) => matchesQuery(row, queryParams));

  return rows;
}
