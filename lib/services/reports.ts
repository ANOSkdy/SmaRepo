import type { ReportRow } from '@/lib/reports/pair';
import { fetchSessionReportRows, type SessionReportRow } from '@/src/lib/sessions-reports';
import { normalizeDailyMinutes } from '@/src/lib/timecalc';
import { query } from '@/lib/db';
import { isBreakPolicyEnabled, resolveBreakPolicy } from '@/lib/policies/breakDeduction';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

function normalizeLookupText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const [first] = value;
    if (typeof first === 'string') {
      const trimmed = first.trim();
      return trimmed ? trimmed : null;
    }
    if (first && typeof first === 'object') {
      const name = (first as { name?: unknown; value?: unknown }).name ??
        (first as { name?: unknown; value?: unknown }).value ??
        String(first);
      const trimmed = String(name).trim();
      return trimmed ? trimmed : null;
    }
    if (first != null) {
      const trimmed = String(first).trim();
      return trimmed ? trimmed : null;
    }
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

type DailyAggregate = {
  totalMinutes: number;
  clientName?: string | null;
};

const STANDARD_WORK_MINUTES = 7.5 * 60;

function toDayKey(session: SessionReportRow): string | null {
  if (typeof session.date === 'string' && session.date.trim().length > 0) {
    return session.date.trim();
  }
  const { year, month, day } = session;
  if (!year || !month || !day) {
    return null;
  }
  const yearStr = year.toString().padStart(4, '0');
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  return `${yearStr}-${monthStr}-${dayStr}`;
}

function buildDailyAggregates(sessions: SessionReportRow[]): Map<string, DailyAggregate> {
  const aggregates = new Map<string, DailyAggregate>();
  for (const session of sessions) {
    const key = toDayKey(session);
    if (!key) {
      continue;
    }
    const entry = aggregates.get(key) ?? { totalMinutes: 0 };

    const rawDuration = session.durationMin;
    if (typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0) {
      entry.totalMinutes += rawDuration;
    }

    const clientName = normalizeLookupText((session as Record<string, unknown>).clientName);
    if (!entry.clientName && clientName) {
      entry.clientName = clientName;
    }

    aggregates.set(key, entry);
  }
  return aggregates;
}

function formatHoursDecimal(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const hours = safeMinutes / 60;
  const rounded = Math.round(hours * 100) / 100;
  const text = rounded.toFixed(2).replace(/\.0+$/, '').replace(/\.([1-9])0$/, '.$1');
  return `${text}h`;
}

function formatTimestampJstFromMs(timestampMs: number | null | undefined): string | null {
  if (timestampMs == null || !Number.isFinite(timestampMs)) {
    return null;
  }
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: 'hour' | 'minute') =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hour = pick('hour');
  const minute = pick('minute');
  if (!hour || !minute) {
    return null;
  }
  return `${hour}:${minute}`;
}

function formatTimestampJst(
  value: string | null | undefined,
  fallbackMs?: number | null | undefined,
): string | null {
  const msCandidate = fallbackMs != null && Number.isFinite(fallbackMs) ? fallbackMs : null;
  if (msCandidate != null) {
    return formatTimestampJstFromMs(msCandidate);
  }
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return formatTimestampJstFromMs(parsed);
}

type SiteRow = { id: string | null; client_name: string | null };

async function fetchSiteClientNames(sessions: SessionReportRow[]): Promise<Map<string, string>> {
  const siteIds = Array.from(
    new Set(
      sessions
        .map((session) => session.siteRecordId)
        .filter((id): id is string => Boolean(id && id.length > 0)),
    ),
  );

  if (siteIds.length === 0) return new Map();

  const result = await query<SiteRow>(
    `
      SELECT
        COALESCE(to_jsonb(s)->>'id', to_jsonb(s)->>'siteId') AS id,
        COALESCE(to_jsonb(s)->>'clientName', to_jsonb(s)->>'client') AS client_name
      FROM sites s
      WHERE COALESCE(to_jsonb(s)->>'id', to_jsonb(s)->>'siteId', '') = ANY($1::text[])
    `,
    [siteIds],
  );

  const map = new Map<string, string>();
  for (const row of result.rows) {
    if (row.id && row.client_name) {
      map.set(row.id, row.client_name);
    }
  }
  return map;
}

export async function getReportRowsByUserName(
  userName: string,
  sort?: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Promise<ReportRow[]> {
  const trimmedName = userName.trim();
  if (!trimmedName) {
    return [];
  }

  const sessions = await fetchSessionReportRows({ userName: trimmedName });
  const completedSessions = sessions.filter(
    (session) => session.isCompleted && session.year && session.month && session.day,
  );

  if (completedSessions.length === 0) {
    return [];
  }

  const aggregates = buildDailyAggregates(completedSessions);
  const siteClientNames = await fetchSiteClientNames(completedSessions);

  const policy = await resolveBreakPolicy({
    userRecordId: completedSessions[0]?.userRecordId,
    userId: completedSessions[0]?.userId,
    userName: trimmedName,
  });
  const breakPolicyApplied = isBreakPolicyEnabled() && !policy.excludeBreakDeduction;

  const dailySummaries = new Map<
    string,
    { workingMinutes: number; overtimeMinutes: number; breakPolicyApplied: boolean }
  >();
  for (const [dayKey, aggregate] of aggregates.entries()) {
    const rawMinutes = Math.max(0, Math.round(aggregate.totalMinutes));
    const netMinutes = normalizeDailyMinutes(rawMinutes);
    const effectiveMinutes = policy.excludeBreakDeduction ? rawMinutes : netMinutes;
    const workingMinutes = Math.min(effectiveMinutes, STANDARD_WORK_MINUTES);
    const overtimeMinutes = Math.max(0, effectiveMinutes - STANDARD_WORK_MINUTES);
    dailySummaries.set(dayKey, {
      workingMinutes,
      overtimeMinutes,
      breakPolicyApplied,
    });
  }

  const rows = completedSessions
    .map<ReportRow>((session) => {
      const key = toDayKey(session);
      const aggregate = key ? aggregates.get(key) : undefined;
      const summary = key ? dailySummaries.get(key) : undefined;
      const siteClientName = session.siteRecordId ? siteClientNames.get(session.siteRecordId) : null;
      const directClientName = normalizeLookupText((session as Record<string, unknown>).clientName);
      const resolvedClientName =
        directClientName ?? aggregate?.clientName ?? siteClientName ?? undefined;
      const startJst = formatTimestampJst(session.start, session.startMs);
      const endJst = formatTimestampJst(session.end, session.endMs);
      const rawDurationMinutes =
        typeof session.durationMin === 'number' && Number.isFinite(session.durationMin)
          ? Math.max(0, Math.round(session.durationMin))
          : 0;
      const minutes = summary?.workingMinutes ?? rawDurationMinutes;
      const overtimeMinutes = summary?.overtimeMinutes ?? 0;
      const overtimeHours = formatHoursDecimal(overtimeMinutes);
      const rowBreakPolicyApplied = summary?.breakPolicyApplied ?? breakPolicyApplied;

      return {
        recordId: session.id,
        year: session.year ?? 0,
        month: session.month ?? 0,
        day: session.day ?? 0,
        siteName: session.siteName ?? '',
        clientName: resolvedClientName ?? undefined,
        minutes,
        startJst,
        endJst,
        startTimestampMs: session.startMs,
        endTimestampMs: session.endMs,
        durationMinutes: rawDurationMinutes,
        overtimeHours,
        autoGenerated: Boolean(session.autoGenerated ?? false),
        breakPolicyApplied: rowBreakPolicyApplied,
      } satisfies ReportRow;
    })
    .filter((row) => row.year > 0 && row.month > 0 && row.day > 0);

  if (sort) {
    const dir = order === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const aValue = a[sort];
      const bValue = b[sort];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const result = aValue.localeCompare(bValue, 'ja');
        return dir === 1 ? result : -result;
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        const result = aValue - bValue;
        return dir === 1 ? result : -result;
      }
      return 0;
    });
  }

  return rows;
}
