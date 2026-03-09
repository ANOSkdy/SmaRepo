// app/api/calendar/month/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/server-env";
import { query } from "@/lib/db";
import { logEvent, newErrorId, toErrorMeta } from "@/lib/diagnostics";

export const runtime = "nodejs";

function parseYearMonth(req: NextRequest): { year: number; month: number } | null {
  const { searchParams } = new URL(req.url);
  const yearValue = searchParams.get("year");
  const monthValue = searchParams.get("month");
  if (!yearValue || !monthValue) return null;

  if (!/^\d{4}$/.test(yearValue) || !/^(?:[1-9]|1[0-2])$/.test(monthValue)) return null;

  const year = Number.parseInt(yearValue, 10);
  const month = Number.parseInt(monthValue, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function buildMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month, 1)); // month(1..12) を渡して「次月1日」を得る
  const endExclusive = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

type SessionSummaryRow = {
  workDate: string; // YYYY-MM-DD
  siteName: string | null;
  sessionCount: number;
  totalMinutes: number | null;
};

export async function GET(req: NextRequest) {
  const errorId = newErrorId();
  const startedAt = Date.now();

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const parsed = parseYearMonth(req);
  logEvent("info", "calendar_month_request", {
    errorId,
    year: parsed?.year ?? null,
    month: parsed?.month ?? null,
    userId,
    auth: userId ? "ok" : "missing",
  });

  if (!userId) {
    logEvent("warn", "calendar_month_unauthorized", { errorId });
    return NextResponse.json({ message: "unauthorized", errorId }, { status: 401 });
  }

  if (!parsed) {
    logEvent("warn", "calendar_month_invalid_query", { errorId });
    return NextResponse.json({ error: "INVALID_QUERY", errorId }, { status: 400 });
  }

  if (!hasDatabaseUrl()) {
    logEvent("error", "calendar_month_db_env_missing", { errorId, year: parsed.year, month: parsed.month });
    return NextResponse.json({ ok: false, error: "Calendar fetch failed", errorId }, { status: 500 });
  }

  try {
    const range = buildMonthRange(parsed.year, parsed.month);

    const res = await query<SessionSummaryRow>(
      `
        SELECT
          s.work_date::text as "workDate",
          s.decided_site_name_snapshot as "siteName",
          COUNT(*)::int as "sessionCount",
          COALESCE(SUM(GREATEST(COALESCE(s.duration_min, 0), 0)), 0)::int as "totalMinutes"
        FROM sessions s
        WHERE s.work_date >= $1::date
          AND s.work_date <  $2::date
        GROUP BY s.work_date, s.decided_site_name_snapshot
        ORDER BY s.work_date ASC, s.decided_site_name_snapshot ASC NULLS LAST
      `,
      [range.start, range.endExclusive]
    );

    const byDate = new Map<string, { sites: Set<string>; sessions: number; totalMinutes: number }>();
    for (const row of res.rows) {
      const date = row.workDate;
      const siteName = (row.siteName ?? "").trim();
      const current = byDate.get(date) ?? { sites: new Set<string>(), sessions: 0, totalMinutes: 0 };
      if (siteName) current.sites.add(siteName);
      current.sessions += Math.max(0, row.sessionCount ?? 0);
      current.totalMinutes += Math.max(0, row.totalMinutes ?? 0);
      byDate.set(date, current);
    }

    const days = Array.from(byDate.entries()).map(([date, value]) => ({
      date,
      sites: Array.from(value.sites).sort((a, b) => a.localeCompare(b, "ja")),
      punches: value.sessions,
      sessions: value.sessions,
      hours: Math.round((value.totalMinutes / 60) * 100) / 100,
      durationMin: value.totalMinutes,
    }));

    logEvent("info", "calendar_month_success", {
      errorId,
      year: parsed.year,
      month: parsed.month,
      fromDate: range.start,
      toDateExclusive: range.endExclusive,
      userId,
      sessionRowCount: res.rows.length,
      dayCount: days.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ year: parsed.year, month: parsed.month, days });
  } catch (error) {
    logEvent("error", "calendar_month_error", {
      errorId,
      year: parsed.year,
      month: parsed.month,
      durationMs: Date.now() - startedAt,
      ...toErrorMeta(error),
    });
    return NextResponse.json({ ok: false, error: "Calendar fetch failed", errorId }, { status: 500 });
  }
}
