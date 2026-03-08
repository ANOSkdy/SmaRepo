'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type AttendanceDetailFilters = {
  siteId?: string;
  siteName?: string;
  machineId?: string;
};

type AttendanceSessionDetail = {
  sessionId: string;
  start: string | null;
  end: string | null;
  siteName: string | null;
  machineId: string | number | null;
  machineName: string | null;
  workDescription: string | null;
};

type AttendanceCalculation = {
  deductBreakMinutes: number;
  roundedMinutes: number;
  roundedHours: number;
  anomalies: string[];
};

type AttendanceDetailResponse = {
  user: {
    userId: number;
    name: string | null;
  };
  date: string;
  sessions: AttendanceSessionDetail[];
  calculation: AttendanceCalculation;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

type AttendanceDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  date: string | null;
  userId: number | null;
  userName?: string | null;
  filters: AttendanceDetailFilters;
};

function roundMinutesToQuarterHours(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

function formatRoundedHoursFromMinutes(
  value: number | null | undefined
): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(roundMinutesToQuarterHours(value) / 60).toFixed(1)}h`;
}

function formatJstDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function AttendanceDetailSheet({
  open,
  onClose,
  date,
  userId,
  userName,
  filters,
}: AttendanceDetailSheetProps) {
  const [state, setState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<AttendanceDetailResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setState('idle');
      return;
    }
    if (!date || userId == null) {
      setDetail(null);
      setState('error');
      setErrorMessage('対象の従業員が選択されていません。');
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setState('loading');
      setErrorMessage(null);
      try {
        const params = new URLSearchParams();
        params.set('date', date);
        params.set('userId', String(userId));
        if (filters.siteId) params.set('siteId', filters.siteId);
        if (!filters.siteId && filters.siteName)
          params.set('siteName', filters.siteName);
        if (filters.machineId) params.set('machineId', filters.machineId);

        const response = await fetch(
          `/api/report/work/attendance/day?${params.toString()}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error(`attendance day error: ${response.status}`);
        }
        const payload = (await response.json()) as AttendanceDetailResponse;
        setDetail(payload);
        setState('success');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('[attendance][day] failed to load detail', error);
        setErrorMessage('日次詳細の取得に失敗しました。');
        setState('error');
      }
    };

    void load();

    return () => controller.abort();
  }, [
    date,
    filters.machineId,
    filters.siteId,
    filters.siteName,
    open,
    reloadToken,
    userId,
  ]);

  useEffect(() => {
    if (open && dialogRef.current) {
      previouslyFocusedElement.current =
        document.activeElement as HTMLElement | null;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const initialTarget =
        closeButtonRef.current ?? focusable.item(0) ?? dialogRef.current;
      initialTarget.focus();
    }

    if (!open && previouslyFocusedElement.current) {
      previouslyFocusedElement.current.focus({ preventScroll: true });
      previouslyFocusedElement.current = null;
    }
  }, [open]);

  const headerTitle = useMemo(() => {
    const label = detail?.date ?? date ?? '';
    const name = detail?.user?.name ?? userName ?? '';
    if (!label) return '勤怠詳細';
    return name ? `${name} / ${label}` : label;
  }, [date, detail?.date, detail?.user?.name, userName]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-detail-title"
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3
              id="attendance-detail-title"
              className="text-lg font-semibold text-gray-900"
            >
              {headerTitle || '勤怠詳細'}
            </h3>
            <p className="text-sm text-gray-500">
              日別のセッションと計算内訳を確認できます。
            </p>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-full border border-gray-200 bg-white p-2 text-sm text-gray-600 transition hover:bg-gray-50"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {state === 'loading' ? (
            <div className="space-y-3 text-sm text-gray-500">
              <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
              <p>読み込み中…</p>
            </div>
          ) : null}

          {state === 'error' ? (
            <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p>{errorMessage ?? 'データ取得に失敗しました。'}</p>
              <button
                type="button"
                onClick={() => {
                  setReloadToken((prev) => prev + 1);
                }}
                className="rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                再試行
              </button>
            </div>
          ) : null}

          {state === 'success' && detail ? (
            <>
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">
                  セッション一覧
                </h4>
                {detail.sessions.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    該当するセッションがありません。
                  </p>
                ) : (
                  <div className="space-y-3">
                    {detail.sessions.map((session) => (
                      <div
                        key={session.sessionId}
                        className="rounded-md border border-gray-200 p-3 text-sm"
                      >
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
                          <span>
                            <span className="font-medium text-gray-700">
                              開始:
                            </span>{' '}
                            {formatJstDateTime(session.start)}
                          </span>
                          <span>
                            <span className="font-medium text-gray-700">
                              終了:
                            </span>{' '}
                            {formatJstDateTime(session.end)}
                          </span>
                        </div>
                        <div className="mt-2 text-gray-600">
                          <div>
                            <span className="font-medium text-gray-700">
                              現場:
                            </span>{' '}
                            {session.siteName ?? '—'}
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">
                              機械:
                            </span>{' '}
                            {session.machineName ?? session.machineId ?? '—'}
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">
                              業務:
                            </span>{' '}
                            {session.workDescription ?? '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">
                  計算内訳
                </h4>
                <div className="grid gap-2 text-sm text-gray-600">
                  <div className="flex items-center justify-between rounded bg-gray-50 px-3 py-2">
                    <span>休憩</span>
                    <span className="font-medium text-gray-800">
                      {formatRoundedHoursFromMinutes(
                        detail.calculation.deductBreakMinutes
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-primary/10 px-3 py-2 text-primary">
                    <span>稼働</span>
                    <span className="font-semibold">
                      {formatRoundedHoursFromMinutes(
                        detail.calculation.roundedMinutes
                      )}
                    </span>
                  </div>
                </div>
                {detail.calculation.anomalies.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    <p className="font-semibold">⚠︎ 異常検知</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {detail.calculation.anomalies.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
