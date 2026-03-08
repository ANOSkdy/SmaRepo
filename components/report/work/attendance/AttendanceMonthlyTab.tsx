'use client';

import { useMemo, useState } from 'react';
import ReportActionBar from '@/components/reports/ReportActionBar';
import ReportFilterPanel from '@/components/reports/ReportFilterPanel';
import AttendanceDetailSheet from './AttendanceDetailSheet';
import AttendanceMatrix from './AttendanceMatrix';
import { buildAttendanceQuery } from './buildAttendanceQuery';
import { useMonthlyAttendance, type AttendanceRow } from './useMonthlyAttendance';

const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

export default function AttendanceMonthlyTab() {
  const [month, setMonth] = useState(defaultMonth);
  const [employeeQuery, setEmployeeQuery] = useState('');

  const [selectedCell, setSelectedCell] = useState<{
    userId: number | null;
    userName: string;
    date: string;
  } | null>(null);

  const filters = useMemo(
    () => ({
      month,
    }),
    [month],
  );

  const { data, state, error, reload } = useMonthlyAttendance(filters);
  const exportQuery = useMemo(() => buildAttendanceQuery(filters), [filters]);
  const exportUrl = useMemo(
    () => `/api/report/work/attendance/export/excel?${exportQuery}`,
    [exportQuery],
  );

  const filteredRows = useMemo<AttendanceRow[]>(() => {
    if (!data?.rows) return [];
    if (!employeeQuery) return data.rows;
    const keyword = employeeQuery.trim().toLowerCase();
    if (!keyword) return data.rows;
    return data.rows.filter((row) => row.name.toLowerCase().includes(keyword));
  }, [data?.rows, employeeQuery]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-text">勤怠（月次）</h1>
        <p className="text-sm text-brand-muted">稼働時間を月次マトリクスで確認できます。</p>
      </header>

      <ReportFilterPanel>
        <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor="attendance-month" className="flex flex-col gap-2 text-sm font-medium text-brand-text">
          月
          <input
            id="attendance-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </label>

        <label htmlFor="attendance-employee-search" className="flex flex-col gap-2 text-sm font-medium text-brand-text">
          従業員検索
          <input
            id="attendance-employee-search"
            type="text"
            placeholder="名前で検索"
            value={employeeQuery}
            onChange={(event) => setEmployeeQuery(event.target.value)}
            className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </label>
        </div>
      </ReportFilterPanel>

      {state === 'loading' ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
          <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-gray-100" />
          <p className="mt-4">読み込み中…</p>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <p>{error ?? '勤怠データの取得に失敗しました。'}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            再試行
          </button>
        </div>
      ) : null}

      {state === 'success' && data ? (
        filteredRows.length > 0 ? (
          <div className="space-y-3">
            <ReportActionBar className="justify-end">
              <a
                href={exportUrl}
                className="inline-flex items-center gap-2 rounded border border-brand-primary px-3 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/10"
              >
                Excel出力
              </a>
            </ReportActionBar>
            <AttendanceMatrix
              days={data.days}
              rows={filteredRows}
              onSelectCell={(payload) => setSelectedCell(payload)}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
            該当する勤怠データがありません。
          </div>
        )
      ) : null}

      <AttendanceDetailSheet
        open={Boolean(selectedCell)}
        onClose={() => setSelectedCell(null)}
        date={selectedCell?.date ?? null}
        userId={selectedCell?.userId ?? null}
        userName={selectedCell?.userName ?? null}
        filters={{}}
      />
    </section>
  );
}
