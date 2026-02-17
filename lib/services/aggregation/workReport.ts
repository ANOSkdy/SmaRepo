import { query } from '@/lib/db';
import { normalizeDailyMinutes } from '@/src/lib/timecalc';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type LogPayloadRow = {
  payload: Record<string, unknown>;
};

type EnrichedLog = {
  id: string;
  type: 'IN' | 'OUT';
  timestampMs: number;
  userKey: string;
  siteName?: string;
  machineId?: string;
  machineLabel?: string;
};

type Session = {
  in: EnrichedLog;
  out: EnrichedLog;
  mins: number;
  dayKeyJst: string;
  attrs: { siteName?: string; machineId?: string; machineLabel?: string };
};

function toUtcRangeOfJstMonth(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0, 0));
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1, -9, 0, 0, 0));
  return { startUtcIso: start.toISOString(), endUtcIso: end.toISOString() };
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeString(item);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function toLogFields(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)) {
    return payload.fields as Record<string, unknown>;
  }
  return payload;
}

function enrichRecord(payload: Record<string, unknown>): EnrichedLog | null {
  const fields = toLogFields(payload);
  const type = fields.type;
  if (type !== 'IN' && type !== 'OUT') return null;

  const timestampRaw = normalizeString(fields.timestamp);
  if (!timestampRaw) return null;
  const timestampMs = Date.parse(timestampRaw);
  if (Number.isNaN(timestampMs)) return null;

  const userKey =
    normalizeString(fields.userId) ??
    (Array.isArray(fields.user) ? normalizeString(fields.user[0]) : normalizeString(fields.user)) ??
    normalizeString(fields['name (from user)']) ??
    normalizeString(fields.userName) ??
    'unknown-user';

  return {
    id: normalizeString(fields.id) ?? normalizeString(payload.id) ?? `${timestampMs}-${type}`,
    type,
    timestampMs,
    userKey,
    siteName: normalizeString(fields.siteName) ?? normalizeString(fields.sitename),
    machineId: normalizeString(fields.machineId) ?? normalizeString(fields.machineid),
    machineLabel: normalizeString(fields.machineName) ?? normalizeString(fields.machinename),
  };
}

function pairByStack(rows: EnrichedLog[]) {
  const stack: EnrichedLog[] = [];
  const sessions: Session[] = [];
  const unmatched: Array<{ kind: 'IN' | 'OUT'; rec: EnrichedLog }> = [];
  const sorted = [...rows].sort((a, b) => a.timestampMs - b.timestampMs);

  for (const row of sorted) {
    if (row.type === 'IN') {
      stack.push(row);
      continue;
    }
    const inRec = stack.pop();
    if (!inRec) {
      unmatched.push({ kind: 'OUT', rec: row });
      continue;
    }
    const mins = Math.max(0, Math.round((row.timestampMs - inRec.timestampMs) / 60000));
    const dayKeyJst = new Date(inRec.timestampMs + JST_OFFSET_MS).toISOString().slice(0, 10);
    sessions.push({
      in: inRec,
      out: row,
      mins,
      dayKeyJst,
      attrs: {
        siteName: inRec.siteName ?? row.siteName,
        machineId: inRec.machineId ?? row.machineId,
        machineLabel: inRec.machineLabel ?? row.machineLabel,
      },
    });
  }

  while (stack.length > 0) {
    const rec = stack.pop();
    if (rec) unmatched.push({ kind: 'IN', rec });
  }

  return { sessions, unmatched };
}

export async function getWorkReportByMonth(params: {
  year: number;
  month: number;
  userKey?: string;
  siteName?: string;
  machineId?: string | number;
}) {
  const { year, month, userKey, siteName, machineId } = params;
  const { startUtcIso, endUtcIso } = toUtcRangeOfJstMonth(year, month);

  const result = await query<LogPayloadRow>(
    `
      SELECT to_jsonb(l) AS payload
      FROM logs l
      WHERE COALESCE(to_jsonb(l)->>'type', '') IN ('IN', 'OUT')
        AND COALESCE(to_jsonb(l)->>'timestamp', '') >= $1
        AND COALESCE(to_jsonb(l)->>'timestamp', '') < $2
      ORDER BY COALESCE(to_jsonb(l)->>'timestamp', '') ASC
    `,
    [startUtcIso, endUtcIso],
  );

  const normalized = result.rows
    .map((row) => enrichRecord(row.payload))
    .filter((row): row is EnrichedLog => Boolean(row))
    .filter((row) => (!userKey ? true : row.userKey === userKey))
    .filter((row) => (!siteName ? true : row.siteName === siteName))
    .filter((row) => (!machineId ? true : row.machineId === String(machineId)));

  const byUser = new Map<string, EnrichedLog[]>();
  for (const row of normalized) {
    if (!byUser.has(row.userKey)) byUser.set(row.userKey, []);
    byUser.get(row.userKey)!.push(row);
  }

  const report = [] as Array<{ userKey: string; days: { day: string; totalMins: number; breakdown: Record<string, number> }[]; unmatchedCount: number }>;
  const warnings: Array<{ kind: 'IN' | 'OUT'; recId: string; userKey: string }> = [];

  for (const [key, rows] of byUser) {
    const { sessions, unmatched } = pairByStack(rows);
    const byDay = new Map<string, { totalMins: number; breakdown: Record<string, number> }>();

    for (const session of sessions) {
      const current = byDay.get(session.dayKeyJst) ?? { totalMins: 0, breakdown: {} };
      current.totalMins += session.mins;
      const label = [session.attrs.siteName ?? '-', session.attrs.machineId ?? session.attrs.machineLabel ?? '-'].join(' / ');
      current.breakdown[label] = (current.breakdown[label] ?? 0) + session.mins;
      byDay.set(session.dayKeyJst, current);
    }

    report.push({
      userKey: key,
      days: Array.from(byDay.entries())
        .map(([day, v]) => ({ day, totalMins: normalizeDailyMinutes(v.totalMins), breakdown: v.breakdown }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      unmatchedCount: unmatched.length,
    });

    for (const item of unmatched) warnings.push({ kind: item.kind, recId: item.rec.id, userKey: key });
  }

  report.sort((a, b) => a.userKey.localeCompare(b.userKey, 'ja'));
  return { range: { startUtcIso, endUtcIso }, result: report, warnings };
}
