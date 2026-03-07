'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MachineTag from '@/components/MachineTag';

type SessionRecord = {
  userName: string;
  siteName: string | null;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  startJst?: string | null;
  endJst?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  hours?: number | null;
  durationMin?: number | null;
  status: 'open' | 'close' | 'closed' | '完了' | '稼働中';
  machineId: string | null | undefined;
  machineCode?: number | null;
  machineName?: string | null;
  workDescription?: string | null;
};

type SessionGroup = {
  userName: string;
  items: SessionRecord[];
};

type DayDetailResponse = {
  date: string;
  sessions: SessionRecord[];
};

type ApiErrorPayload = {
  errorId?: string;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

type DayDetailDrawerProps = {
  date: string | null;
  open: boolean;
  onClose: () => void;
};

function formatDateLabel(date: string | null) {
  if (!date) return '';
  try {
    const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', {
      weekday: 'short',
      timeZone: 'Asia/Tokyo',
    });
    const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
    const parsed = new Date(`${date}T00:00:00+09:00`);
    return `${dateFormatter.format(parsed)} (${weekdayFormatter.format(parsed)})`;
  } catch {
    return date;
  }
}

function normalizeJstTime(value: string | null | undefined): string | null {
  if (!value) return null;

  const plainTime = value.match(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
  if (plainTime) {
    return value;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
  }

  return null;
}

function getSessionTimeRange(session: SessionRecord) {
  const start =
    normalizeJstTime(session.clockInAt) ?? normalizeJstTime(session.startJst) ?? normalizeJstTime(session.startAt);
  const end = normalizeJstTime(session.clockOutAt) ?? normalizeJstTime(session.endJst) ?? normalizeJstTime(session.endAt);

  return {
    startLabel: start ?? '--:--',
    endLabel: end ?? '--:--',
  };
}

export default function DayDetailDrawer({ date, open, onClose }: DayDetailDrawerProps) {
  const [state, setState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [detail, setDetail] = useState<DayDetailResponse | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !date) {
      setDetail(null);
      setState('idle');
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setState('loading');
      setErrorMessage('');
      try {
        const response = await fetch(`/api/calendar/day?date=${date}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
          const detail = payload?.errorId ? ` errorId: ${payload.errorId}` : '';
          setErrorMessage(`Failed to load (status ${response.status})${detail}`);
          setState('error');
          return;
        }
        const payload = (await response.json()) as DayDetailResponse;
        setDetail(payload);
        setState('success');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load day detail', error);
        setErrorMessage('Failed to load (status network)');
        setState('error');
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [date, open]);

  useEffect(() => {
    if (open && dialogRef.current) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement | null;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const initialTarget = closeButtonRef.current ?? focusable.item(0) ?? dialogRef.current;
      initialTarget.focus();
    }

    if (!open && previouslyFocusedElement.current) {
      previouslyFocusedElement.current.focus({ preventScroll: true });
      previouslyFocusedElement.current = null;
    }
  }, [open]);

  const headerLabel = useMemo(() => formatDateLabel(detail?.date ?? date ?? null), [date, detail?.date]);

  const resolveStatus = (status: SessionRecord['status']) => {
    if (status === 'open' || status === '稼働中') {
      return {
        label: '稼働中',
        className: 'text-red-600',
      };
    }
    return {
      label: '完了',
      className: 'text-blue-600',
    };
  };

  const sessionGroups = useMemo<SessionGroup[]>(() => {
    if (!detail?.sessions) {
      return [];
    }
    const grouped = new Map<string, SessionGroup>();
    for (const session of detail.sessions) {
      const key = session.userName || '未登録ユーザー';
      const current = grouped.get(key);
      if (current) {
        current.items.push(session);
      } else {
        grouped.set(key, { userName: key, items: [session] });
      }
    }
    return Array.from(grouped.values());
  }, [detail?.sessions]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-10"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
          return;
        }
        if (event.key === 'Tab' && dialogRef.current) {
          const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          if (focusable.length === 0) {
            return;
          }
          const first = focusable.item(0);
          const last = focusable.item(focusable.length - 1);
          const active = document.activeElement as HTMLElement | null;
          if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
          }
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-detail-title"
        tabIndex={-1}
        className="w-full max-w-4xl rounded-3xl border border-brand-border bg-brand-surface-alt shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-brand-border px-6 py-4">
          <div>
            <h3 id="day-detail-title" className="text-lg font-semibold text-brand-text">
              {headerLabel || '日次詳細'}
            </h3>
            <p className="text-sm text-brand-muted">ユーザーごとのセッション概要を表示します。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            className="tap-target rounded-full border border-brand-border bg-brand-surface-alt p-2 text-sm text-brand-text transition hover:bg-brand-surface"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5" aria-live="polite">
          {state === 'loading' ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-2xl border border-brand-border bg-brand-surface p-4">
                  <div className="h-4 w-32 rounded bg-brand-border" />
                  <div className="mt-2 h-4 w-48 rounded bg-brand-border/80" />
                </div>
              ))}
            </div>
          ) : state === 'error' ? (
            <div
              className="rounded-lg border border-brand-border bg-brand-surface-alt px-4 py-3 text-sm text-brand-error"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <section>
                <h4 className="text-sm font-semibold text-brand-text">稼働状況</h4>
                {sessionGroups.length === 0 ? (
                  <p className="mt-2 text-sm text-brand-muted">この日にペアリングされたセッションはありません。</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {sessionGroups.map((group) => (
                      <div
                        key={group.userName}
                        className="rounded-2xl border border-brand-border bg-brand-surface-alt p-4 shadow-sm sm:p-5"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-[15px] font-semibold text-brand-text !text-black !opacity-100 sm:text-base">
                            {group.userName}
                          </p>
                        </div>
                        <div className="mt-2 divide-y divide-brand-border/60">
                          {group.items.map((session, index) => {
                            const statusMeta = resolveStatus(session.status);
                            const { startLabel, endLabel } = getSessionTimeRange(session);
                            return (
                              <div
                                key={`${session.userName}-${session.clockInAt}-${index}`}
                                className="py-2 first:pt-0 last:pb-0"
                              >
                                <p className="text-xs text-brand-muted sm:text-sm">
                                  {session.siteName ?? '現場未設定'}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-brand-text">
                                  <span>
                                    {startLabel} ～ {endLabel}
                                  </span>
                                  {typeof session.hours === 'number' ? <span>（{session.hours}時間）</span> : null}
                                  <span className={`text-xs sm:text-sm ${statusMeta.className}`}>{statusMeta.label}</span>
                                </div>
                                <div className="mt-1 text-sm text-brand-text">
                                  <span className="mr-2 opacity-70">機械</span>
                                  <MachineTag
                                    id={session.machineCode?.toString() ?? session.machineId}
                                    name={session.machineName}
                                    className="tabular-nums"
                                  />
                                </div>
                                <p className="mt-1 text-sm text-brand-muted">
                                  業務内容 {session.workDescription ?? '—'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <p className="text-sm text-gray-500">対象日の情報が見つかりませんでした。</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-brand-border px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="tap-target rounded-xl border border-brand-border bg-brand-surface-alt px-4 py-2 text-sm font-semibold text-brand-text shadow-sm transition hover:bg-brand-surface"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
