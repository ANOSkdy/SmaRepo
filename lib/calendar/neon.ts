import { query } from '@/lib/db';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';

export type LogType = 'IN' | 'OUT';

export type NormalizedLog = {
  id: string;
  type: LogType;
  timestamp: string;
  timestampMs: number;
  userId: string | null;
  userName: string | null;
  machineId: string | null;
  machineName: string | null;
  siteName: string | null;
  workDescriptions: string[];
  rawFields: Record<string, unknown>;
};

export type CalendarDaySummary = {
  date: string;
  sites: string[];
  punches: number;
  sessions: number;
  hours: number;
};

export type SessionDetail = {
  userId: string | null;
  startMs: number;
  endMs?: number;
  startLogId: string;
  endLogId?: string;
  userName: string;
  siteName: string | null;
  clockInAt: string;
  clockOutAt?: string;
  hours?: number;
  status: '正常' | '稼働中';
  machineId: string | null;
  machineName: string | null;
  workDescription: string | null;
};

type LogPayloadRow = {
  payload: Record<string, unknown>;
};

const JST_OFFSET = 9 * 60 * 60 * 1000;

function normalizeLookupText(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeLookupText(entry);
      if (normalized) return normalized;
    }
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeMachineIdentifier(value: unknown): string | null {
  const text = normalizeLookupText(value);
  if (!text) return null;

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const normalized = normalizeMachineIdentifier(item);
          if (normalized) return normalized;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  const [first] = text.split(',');
  const normalized = first.trim();
  return normalized.length > 0 ? normalized : null;
}

function readLookup(
  fields: Record<string, unknown>,
  keys: readonly string[],
  machine = false,
): string | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const normalized = machine
      ? normalizeMachineIdentifier(fields[key])
      : normalizeLookupText(fields[key]);
    if (normalized) return normalized;
  }
  return null;
}

function extractWorkDescriptions(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractWorkDescriptions(entry));
  }
  const text = String(value).trim();
  return text.length > 0 ? [text] : [];
}

function formatJstDate(ms: number): string {
  const jst = new Date(ms + JST_OFFSET);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

function formatJstTime(ms: number): string {
  const jst = new Date(ms + JST_OFFSET);
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
}

function toNormalizedLog(payload: Record<string, unknown>): NormalizedLog | null {
  const rawFields =
    payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)
      ? (payload.fields as Record<string, unknown>)
      : payload;

  const type = rawFields.type;
  if (type !== 'IN' && type !== 'OUT') return null;

  const timestamp = typeof rawFields.timestamp === 'string' ? rawFields.timestamp : null;
  if (!timestamp) return null;

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return null;

  const machineId =
    readLookup(rawFields, ['machineId', 'machineid', 'machineId (from machine)', 'machineid (from machine)'], true) ??
    normalizeMachineIdentifier(rawFields.machine_id);
  const machineName =
    readLookup(rawFields, ['machineName', 'machinename', 'machineName (from machine)', 'machinename (from machine)']) ??
    null;

  return {
    id: normalizeLookupText(rawFields.id) ?? normalizeLookupText(payload.id) ?? `${timestampMs}-${type}`,
    type,
    timestamp,
    timestampMs,
    userId: normalizeLookupText(rawFields.userId) ?? null,
    userName: readLookup(rawFields, ['name (from user)', 'userName (from user)', 'userName', 'username']),
    machineId: machineId ?? null,
    machineName,
    siteName: normalizeLookupText(rawFields.siteName) ?? normalizeLookupText(rawFields.sitename),
    workDescriptions: Array.from(new Set(extractWorkDescriptions(rawFields.workDescription))),
    rawFields,
  };
}

function pickSessionWorkDescription(
  logs: NormalizedLog[],
  userKey: string,
  startMs: number,
  endMs: number,
  fallback: NormalizedLog,
): string | null {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];
    if (log.timestampMs > endMs || log.timestampMs < startMs) continue;
    const key = log.userId ?? log.userName ?? 'unknown-user';
    if (key !== userKey) continue;
    if (log.workDescriptions.length > 0) return Array.from(new Set(log.workDescriptions)).join(' / ');
  }

  if (fallback.workDescriptions.length > 0) return Array.from(new Set(fallback.workDescriptions)).join(' / ');
  return null;
}

function createOpenSession(log: NormalizedLog): SessionDetail {
  return {
    userId: log.userId,
    startMs: log.timestampMs,
    startLogId: log.id,
    userName: log.userName ?? '未登録ユーザー',
    siteName: log.siteName,
    clockInAt: formatJstTime(log.timestampMs),
    status: '稼働中',
    machineId: log.machineId,
    machineName: log.machineName,
    workDescription: log.workDescriptions.join(' / ') || null,
  };
}

function isCompletedSession(
  session: SessionDetail,
): session is SessionDetail & { endMs: number; hours: number } {
  return session.status === '正常' && typeof session.endMs === 'number' && typeof session.hours === 'number';
}

function buildSessionDetails(logs: NormalizedLog[]): SessionDetail[] {
  const sorted = [...logs].sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
  const openSessions = new Map<string, NormalizedLog | null>();
  const sessions: SessionDetail[] = [];

  for (const log of sorted) {
    const userKey = log.userId ?? log.userName ?? 'unknown-user';
    const currentOpen = openSessions.get(userKey) ?? null;

    if (log.type === 'IN') {
      if (currentOpen) sessions.push(createOpenSession(currentOpen));
      openSessions.set(userKey, log);
      continue;
    }

    if (!currentOpen || log.timestampMs <= currentOpen.timestampMs) continue;

    const durationMinutes = Math.max(0, Math.round((log.timestampMs - currentOpen.timestampMs) / 60000));
    const { hours } = applyTimeCalcV2FromMinutes(durationMinutes, { breakMinutes: 0 });

    sessions.push({
      userId: currentOpen.userId ?? log.userId,
      startMs: currentOpen.timestampMs,
      endMs: log.timestampMs,
      startLogId: currentOpen.id,
      endLogId: log.id,
      userName: currentOpen.userName ?? log.userName ?? '未登録ユーザー',
      siteName: currentOpen.siteName ?? log.siteName,
      clockInAt: formatJstTime(currentOpen.timestampMs),
      clockOutAt: formatJstTime(log.timestampMs),
      hours,
      status: '正常',
      machineId: currentOpen.machineId ?? log.machineId,
      machineName: currentOpen.machineName ?? log.machineName,
      workDescription: pickSessionWorkDescription(sorted, userKey, currentOpen.timestampMs, log.timestampMs, log),
    });

    openSessions.set(userKey, null);
  }

  for (const pending of openSessions.values()) {
    if (pending) sessions.push(createOpenSession(pending));
  }

  return sessions;
}

export function summariseMonth(logs: NormalizedLog[]): CalendarDaySummary[] {
  const grouped = new Map<string, NormalizedLog[]>();
  for (const log of logs) {
    const date = formatJstDate(log.timestampMs);
    const group = grouped.get(date) ?? [];
    group.push(log);
    grouped.set(date, group);
  }

  return Array.from(grouped.entries())
    .map(([date, items]) => {
      const sessions = buildSessionDetails(items).filter(isCompletedSession);
      const totalMinutes = sessions.reduce(
        (total, session) => total + Math.max(0, Math.round((session.endMs - session.startMs) / 60000)),
        0,
      );
      const { hours } = applyTimeCalcV2FromMinutes(totalMinutes);

      return {
        date,
        sites: Array.from(
          new Set(items.map((item) => item.siteName).filter((name): name is string => Boolean(name))),
        ),
        punches: items.length,
        sessions: sessions.length,
        hours,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDayDetail(logs: NormalizedLog[]): { sessions: SessionDetail[] } {
  return { sessions: buildSessionDetails(logs) };
}

export async function getLogsBetween(params: {
  fromDate: string;
  toDateExclusive: string;
}): Promise<NormalizedLog[]> {
  const result = await query<LogPayloadRow>(
    `
      SELECT to_jsonb(l) AS payload
      FROM logs l
      WHERE COALESCE(to_jsonb(l)->>'date', '') >= $1
        AND COALESCE(to_jsonb(l)->>'date', '') < $2
      ORDER BY
        COALESCE(to_jsonb(l)->>'timestamp', '') ASC,
        COALESCE(to_jsonb(l)->>'id', '') ASC
    `,
    [params.fromDate, params.toDateExclusive],
  );

  return result.rows
    .map((row) => toNormalizedLog(row.payload))
    .filter((log): log is NormalizedLog => Boolean(log));
}
