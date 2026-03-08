// app/reports/page.tsx
import Link from "next/link";

import ReportsTabs from "@/components/reports/ReportsTabs";
import {
  buildReportContext,
  flattenReportGroups,
  formatHoursFromMinutes,
  formatWorkingHours,
  parseFilters,
  sortReportItems,
  summarizeReportItems,
  type SearchParams,
  fetchUsers,
} from "./_utils/reportData";

type MaybePromise<T> = T | Promise<T>;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: MaybePromise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const filters = parseFilters(sp);

  const { groups, availableYears, availableMonths, availableDays, availableSites } =
    await buildReportContext(filters);

  const flatItems = flattenReportGroups(groups);
  const sortedItems = sortReportItems(flatItems);
  const { totalWorkingMinutes, totalOvertimeMinutes, totalSummaryMinutes } =
    summarizeReportItems(flatItems);

  const users = await fetchUsers();
  const exportUrl = filters.user
    ? (() => {
        const params = new URLSearchParams();
        params.set("user", filters.user);
        if (filters.site) params.set("site", filters.site);
        if (filters.year) params.set("year", String(filters.year));
        if (filters.month) params.set("month", String(filters.month));
        if (filters.day) params.set("day", String(filters.day));
        if (filters.auto) params.set("auto", filters.auto);
        return `/api/reports/export/excel?${params.toString()}`;
      })()
    : "";

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ReportsTabs />
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">個別集計</h1>
          <p className="text-sm text-gray-600">従業員ごとのセッション記録から稼働時間を算出します。</p>
        </header>

        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6" method="get">
          <div className="flex flex-col">
            <label htmlFor="user" className="text-sm font-medium text-gray-700">
              従業員名
            </label>
            <select
              id="user"
              name="user"
              defaultValue={filters.user}
              className="mt-1 min-w-[200px] rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              aria-describedby="user-helper"
            >
              <option value="">-- 選択してください --</option>
              {users.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span id="user-helper" className="mt-1 text-xs text-gray-500">
              対象の従業員を選ぶとグリッドが表示されます。
            </span>
          </div>

          <div className="flex flex-col">
            <label htmlFor="site" className="text-sm font-medium text-gray-700">
              現場名
            </label>
            <select
              id="site"
              name="site"
              defaultValue={filters.site}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableSites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="year" className="text-sm font-medium text-gray-700">
              年
            </label>
            <select
              id="year"
              name="year"
              defaultValue={filters.year?.toString() ?? ""}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="month" className="text-sm font-medium text-gray-700">
              月
            </label>
            <select
              id="month"
              name="month"
              defaultValue={filters.month?.toString() ?? ""}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="day" className="text-sm font-medium text-gray-700">
              日
            </label>
            <select
              id="day"
              name="day"
              defaultValue={filters.day?.toString() ?? ""}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableDays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="auto" className="text-sm font-medium text-gray-700">
              自動退勤
            </label>
            <select
              id="auto"
              name="auto"
              defaultValue={filters.auto ?? "all"}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="all">すべて</option>
              <option value="only">自動のみ</option>
              <option value="exclude">自動を除外</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded border border-primary bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              絞り込み
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 _print-hidden">
          <span>※ グリッドの列構成・表記は現行と同じです。必要に応じて上部のフィルターをご利用ください。</span>
          <div className="flex items-center gap-3">
            {exportUrl ? (
              <a href={exportUrl} className="rounded border border-primary px-3 py-1 text-primary hover:bg-primary/10">
                Excel出力
              </a>
            ) : null}
            <Link href="/reports" className="text-primary underline">
              条件をクリア
            </Link>
          </div>
        </div>

        {filters.user && (
          <section className="space-y-4">
            {flatItems.length === 0 ? (
              <div className="rounded border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
                条件に一致するデータがありません。
              </div>
            ) : (
              <div className="screen-table-wrapper">
                <div className="overflow-x-auto rounded border">
                  <table className="table-unified text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-700">
                        <th className="border px-3 py-2 text-left font-semibold">年</th>
                        <th className="border px-3 py-2 text-left font-semibold">月</th>
                        <th className="border px-3 py-2 text-left font-semibold">日</th>
                        <th className="border px-3 py-2 text-left font-semibold">曜</th>
                        <th className="border px-3 py-2 text-left font-semibold">従業員</th>
                        <th className="border px-3 py-2 text-left font-semibold">現場名</th>
                        <th className="border px-3 py-2 text-left font-semibold">作業内容</th>
                        <th className="border px-3 py-2 text-left font-semibold">始業</th>
                        <th className="border px-3 py-2 text-left font-semibold">終業</th>
                        <th className="border px-3 py-2 text-right font-semibold">稼働</th>
                        <th className="border px-3 py-2 text-right font-semibold">超過</th>
                        <th className="border px-3 py-2 text-right font-semibold">計</th>
                      </tr>
                    </thead>

                    <tbody className="bg-white text-gray-900">
                      {sortedItems.map((row) => {
                        const summaryMinutes = row.workingMinutes + row.overtimeMinutes;
                        const totalHoursText = formatHoursFromMinutes(summaryMinutes);
                        const rowKey =
                          row.recordId ??
                          `${row.year}-${row.month}-${row.day}-${row.siteName ?? ""}-${row.startTimestampMs ?? ""}-${row.endTimestampMs ?? ""}`;

                        const weekdayLabel = new Date(row.year, Math.max(0, row.month - 1), row.day).toLocaleDateString(
                          "ja-JP",
                          { weekday: "short" }
                        );

                        return (
                          <tr key={rowKey} className="odd:bg-white even:bg-gray-50">
                            <td className="border px-3 py-2 tabular-nums">{row.year}</td>
                            <td className="border px-3 py-2 tabular-nums">{row.month}</td>
                            <td className="border px-3 py-2 tabular-nums">{row.day}</td>
                            <td className="border px-3 py-2">{weekdayLabel}</td>
                            <td className="border px-3 py-2">{filters.user || "—"}</td>
                            <td className="border px-3 py-2">{row.siteName || "—"}</td>
                            <td className="border px-3 py-2">{row.workDescription?.trim() || "—"}</td>
                            <td className="border px-3 py-2 tabular-nums">{row.startJst ?? "—"}</td>
                            <td className="border px-3 py-2 tabular-nums">
                              <div className="flex items-center gap-2">
                                <span>{row.endJst ?? "—"}</span>
                                {row.autoGenerated ? (
                                  <span
                                    className="badge-auto inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 shadow-[0_0_0_2px_rgba(255,255,255,0.95)]"
                                    aria-label="自動退勤で生成された記録"
                                    role="img"
                                  />
                                ) : null}
                              </div>
                            </td>
                            <td className="border px-3 py-2 text-right tabular-nums">{formatWorkingHours(row.workingMinutes)}</td>
                            <td className="border px-3 py-2 text-right tabular-nums">{formatHoursFromMinutes(row.overtimeMinutes)}</td>
                            <td className="border px-3 py-2 text-right tabular-nums">{totalHoursText}</td>
                          </tr>
                        );
                      })}
                    </tbody>

                    <tfoot className="bg-gray-50 text-gray-700">
                      <tr>
                        <td className="border px-3 py-2 font-semibold" colSpan={9}>
                          合計
                        </td>
                        <td className="border px-3 py-2 text-right tabular-nums font-semibold">{formatWorkingHours(totalWorkingMinutes)}</td>
                        <td className="border px-3 py-2 text-right tabular-nums font-semibold">{formatHoursFromMinutes(totalOvertimeMinutes)}</td>
                        <td className="border px-3 py-2 text-right tabular-nums font-semibold">{formatHoursFromMinutes(totalSummaryMinutes)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
