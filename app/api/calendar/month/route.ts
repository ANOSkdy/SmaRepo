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

type LogRow = {
  work_date: string; // YYYY-MM-DD
  decided_site_name_snapshot: string | null;
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

    const res = await query<LogRow>(
      `
        SELECT work_date::text as work_date, decided_site_name_snapshot
        FROM logs
        WHERE user_id = $1::uuid
          AND work_date >= $2::date
          AND work_date <  $3::date
        ORDER BY work_date ASC, stamped_at ASC
      `,
      [userId, range.start, range.endExclusive]
    );

    // 日ごとに「現場名リスト」を作る（UI側は sites が空なら "現場情報なし" になる想定）
    const byDate = new Map<string, Set<string>>();
    for (const row of res.rows) {
      const d = row.work_date;
      const s = (row.decided_site_name_snapshot ?? "").trim();
      if (!byDate.has(d)) byDate.set(d, new Set<string>());
      if (s) byDate.get(d)!.add(s);
    }

    const days = Array.from(byDate.entries()).map(([date, sitesSet]) => ({
      date,
      sites: Array.from(sitesSet).sort((a, b) => a.localeCompare(b, "ja")),
    }));

    logEvent("info", "calendar_month_success", {
      errorId,
      year: parsed.year,
      month: parsed.month,
      fromDate: range.start,
      toDateExclusive: range.endExclusive,
      userId,
      logCount: res.rows.length,
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
