'use client';

import './sites.css';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import FilterChipGroup from '@/components/reports/FilterChipGroup';
import ReportActionBar from '@/components/reports/ReportActionBar';
import ReportFilterPanel from '@/components/reports/ReportFilterPanel';
import ReportPageShell from '@/components/reports/ReportPageShell';
import ReportsTabs from '@/components/reports/ReportsTabs';
import { getJstParts } from '@/lib/jstDate';
import { compareMachineId } from '@/lib/utils/sort';
import MachineCheckboxGroup from './_components/MachineCheckboxGroup';
import { formatQuarterHours, sumColumnHours, toMachineHeader, type SessionRow } from './_lib/gridUtils';

type SiteMaster = {
  id: string;
  fields: {
    name: string;
    client?: string;
  };
};

type MachineMaster = {
  id: string;
  fields?: {
    machineid?: string | null;
    name?: string | null;
  };
};

type ReportColumnSession = {
  user?: string | number;
  machineId?: string | number | null;
  machineID?: string | number | null;
  machineName?: string | null;
  machine?: unknown;
  durationMin?: number | null;
  durationMinutes?: number | null;
  minutes?: number | null;
  mins?: number | null;
  hours?: number | null;
  durationHours?: number | null;
  totalHours?: number | null;
  date?: string;
  [key: string]: unknown;
};

type ReportColumn = {
  key: string;
  userName: string;
  workDescription: string;
  machineId?: string | number | null;
  machineIds?: Array<string | number | null>;
  machineName?: string | null;
  machineNames?: Array<string | null>;
  sessions?: ReportColumnSession[];
};

type DayRow = {
  date: string;
  day: number;
  dow: string;
  values: number[];
};

type ReportResponse = {
  site?: {
    client?: string;
  };
  columns?: ReportColumn[];
  days?: DayRow[];
};

const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const MIN_DYNAMIC_COLUMNS = 8;

function toText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export default function SiteReportPage() {
  const [monthValue, setMonthValue] = useState(defaultMonth);
  const [sites, setSites] = useState<SiteMaster[]>([]);
  const [machines, setMachines] = useState<MachineMaster[]>([]);
  const [siteId, setSiteId] = useState('');
  const [siteClient, setSiteClient] = useState('');
  const [machineFilter, setMachineFilter] = useState<string[]>([]);
  const [workTypeFilter, setWorkTypeFilter] = useState<'all' | 'regular' | 'operating' | 'other'>('all');

  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function loadMasters() {
      try {
        const machineResponsePromise = fetch('/api/masters/machines', {
          cache: 'no-store',
          credentials: 'same-origin',
        }).catch((error) => {
          console.warn('[reports][sites] failed to fetch machine masters', error);
          return null;
        });
        const [siteRes, machineRes] = await Promise.all([
          fetch('/api/masters/sites', { cache: 'no-store', credentials: 'same-origin' }),
          machineResponsePromise,
        ]);
        if (!siteRes.ok) {
          throw new Error('Failed to load site masters');
        }
        const sitesJson = (await siteRes.json()) as SiteMaster[] | null;
        if (!active) return;
        setSites(Array.isArray(sitesJson) ? sitesJson : []);
        if (machineRes?.ok) {
          const json = await machineRes.json();
          if (!active) return;
          const list: MachineMaster[] = Array.isArray(json?.records)
            ? json.records
            : Array.isArray(json)
              ? json
              : [];
          setMachines(list);
        } else if (machineRes && !machineRes.ok) {
          console.warn('[reports][sites] machine masters responded with non-ok status', machineRes.status);
          if (active) {
            setMachines([]);
          }
        }
      } catch (err) {
        console.error('[reports][sites] failed to load masters', err);
      }
    }
    loadMasters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!siteId) {
      setSiteClient('');
      return;
    }
    const site = sites.find((item) => item.id === siteId);
    setSiteClient(site?.fields?.client ?? '');
  }, [siteId, sites]);

  const { year, month } = useMemo(() => {
    const [yearText, monthText] = monthValue.split('-');
    const parsedYear = Number(yearText);
    const parsedMonth = Number(monthText);
    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
      return { year: Number.NaN, month: Number.NaN };
    }
    return { year: parsedYear, month: parsedMonth };
  }, [monthValue]);

  const derivedMachineLabels = useMemo(() => {
    const map = new Map<string, string>();
    columns.forEach((column) => {
      const rawIds = Array.isArray(column.machineIds)
        ? column.machineIds
        : column.machineId != null
          ? [column.machineId]
          : [];
      const rawNames = Array.isArray(column.machineNames)
        ? column.machineNames
        : column.machineName != null
          ? [column.machineName]
          : [];
      rawIds.forEach((value, index) => {
        if (value == null) {
          return;
        }
        const idText =
          typeof value === 'number'
            ? String(value)
            : typeof value === 'string'
              ? value.trim()
              : '';
        if (!idText) {
          return;
        }
        const nameCandidate = rawNames[index] ?? rawNames[0] ?? null;
        const nameText =
          typeof nameCandidate === 'string' && nameCandidate.trim().length > 0
            ? nameCandidate.trim()
            : '';
        if (!map.has(idText) || (!map.get(idText) && nameText)) {
          map.set(idText, nameText);
        }
      });
    });
    return map;
  }, [columns]);

  const machineOptions = useMemo(() => {
    const map = new Map<string, string>();

    const normalizeMachineCode = (value: unknown) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : '';
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
      return '';
    };

    const resolveMachineCode = (machine: MachineMaster) => {
      const fields = machine.fields as Record<string, unknown> | undefined;
      const candidates = [
        fields?.machineid,
        fields?.machineId,
        fields?.machine_id,
        fields?.machinecode,
        fields?.machine_code,
        fields?.code,
      ];
      for (const candidate of candidates) {
        const code = normalizeMachineCode(candidate);
        if (code) {
          return code;
        }
      }
      return '';
    };

    derivedMachineLabels.forEach((label, id) => {
      map.set(id, label);
    });

    machines.forEach((machine) => {
      const machineCode = resolveMachineCode(machine);
      const fallbackId = typeof machine.id === 'string' ? machine.id.trim() : String(machine.id);
      const id = machineCode || fallbackId;
      if (!id) {
        return;
      }
      const nameRaw =
        typeof machine.fields?.name === 'string' ? machine.fields.name.trim() : '';
      const existing = map.get(id) ?? '';
      const label = nameRaw || existing || id;
      map.set(id, label);
    });

    return Array.from(map.entries())
      .filter(([id]) => id.trim().length > 0)
      .sort((a, b) =>
        compareMachineId(
          { machineId: a[0], machineName: a[1] },
          { machineId: b[0], machineName: b[1] },
        ),
      )
      .map(([id, name]) => ({
        id,
        name: name.trim().length > 0 ? `${name} (${id})` : id,
      }));
  }, [derivedMachineLabels, machines]);

  const employeeOptions = useMemo(() => {
    const names = new Set<string>();
    columns.forEach((column) => {
      if (column.userName) {
        names.add(column.userName);
      }
    });
    return Array.from(names);
  }, [columns]);

  const indexedColumns = useMemo(
    () => columns.map((column, index) => ({ column, index })),
    [columns],
  );

  const sessionRowsByColumnKey = useMemo(() => {
    const map = new Map<string, SessionRow[]>();

    const coerceId = (value: unknown): string | number | null => {
      if (value == null) {
        return null;
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const text = value.trim();
        return text.length > 0 ? text : null;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const coerced = coerceId(item);
          if (coerced != null) {
            return coerced;
          }
        }
        return null;
      }
      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if ('id' in record) {
          const coerced = coerceId(record.id);
          if (coerced != null) {
            return coerced;
          }
        }
        if ('value' in record) {
          const coerced = coerceId(record.value);
          if (coerced != null) {
            return coerced;
          }
        }
      }
      return null;
    };

    const coerceName = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const coerced = coerceName(item);
          if (coerced) {
            return coerced;
          }
        }
        return null;
      }
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const keys = [
          'name',
          'machineName',
          'machinename',
          'label',
          'displayName',
          'displayname',
          'title',
        ];
        for (const key of keys) {
          if (key in record) {
            const coerced = coerceName(record[key]);
            if (coerced) {
              return coerced;
            }
          }
        }
      }
      return null;
    };

    const pickFirstId = (...values: unknown[]): string | number | null => {
      for (const value of values) {
        const coerced = coerceId(value);
        if (coerced != null) {
          return coerced;
        }
      }
      return null;
    };

    const pickFirstName = (...values: unknown[]): string | null => {
      for (const value of values) {
        const coerced = coerceName(value);
        if (coerced) {
          return coerced;
        }
      }
      return null;
    };

    const coerceDurationMin = (session: ReportColumnSession): number | null => {
      const candidates = [
        session.durationMin,
        session.durationMinutes,
        session.minutes,
        session.mins,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          return candidate;
        }
      }
      return null;
    };

    const coerceHours = (session: ReportColumnSession): number | null => {
      const candidates = [session.hours, session.durationHours, session.totalHours];
      for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          return candidate;
        }
      }
      return null;
    };

    const normalizeKey = (key: string) => key.replace(/[\s_()\-]/g, '').toLowerCase();

    columns.forEach((column) => {
      const sessionRows: SessionRow[] = [];

      if (Array.isArray(column.sessions)) {
        column.sessions.forEach((entry) => {
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const session = entry as ReportColumnSession;
          const record = session as Record<string, unknown>;
          const normalizedValues = new Map<string, unknown>();
          for (const [key, value] of Object.entries(record)) {
            const normalized = normalizeKey(key);
            if (!normalizedValues.has(normalized)) {
              normalizedValues.set(normalized, value);
            }
          }

          const readNormalized = (...keys: string[]) => {
            for (const key of keys) {
              const normalized = normalizeKey(key);
              if (normalizedValues.has(normalized)) {
                return normalizedValues.get(normalized);
              }
            }
            return undefined;
          };

          const machineField = record.machine;
          const machineId =
            pickFirstId(
              session.machineId,
              session.machineID,
              readNormalized('machineid'),
              readNormalized('machineidfrommachine'),
              readNormalized('machinenumber'),
              readNormalized('machinecode'),
              readNormalized('machinecodefrommachine'),
              typeof machineField === 'object' && machineField !== null && !Array.isArray(machineField)
                ? (machineField as Record<string, unknown>).id
                : undefined,
            ) ?? null;
          const machineName =
            pickFirstName(
              session.machineName,
              readNormalized('machinename'),
              readNormalized('machinenamefrommachine'),
              readNormalized('machinelabel'),
              readNormalized('machinedisplayname'),
              readNormalized('machinenamejapanese'),
              typeof machineField === 'object' && machineField !== null && !Array.isArray(machineField)
                ? machineField
                : undefined,
            );
          sessionRows.push({
            user: session.user,
            machineId,
            machineName: machineName ?? null,
            durationMin: coerceDurationMin(session),
            hours: coerceHours(session),
            date: typeof session.date === 'string' ? session.date : undefined,
          });
        });
      }

      const hasMachineInfo = sessionRows.some(
        (row) => row.machineId != null || (row.machineName != null && row.machineName !== ''),
      );

      if (!hasMachineInfo) {
        const machineIds = Array.isArray(column.machineIds)
          ? column.machineIds
          : column.machineId != null
            ? [column.machineId]
            : [];
        const machineNames = Array.isArray(column.machineNames)
          ? column.machineNames
          : column.machineName != null
            ? [column.machineName]
            : [];
        const length = Math.max(machineIds.length, machineNames.length);
        for (let index = 0; index < length; index += 1) {
          const idCandidate =
            machineIds[index] ?? machineIds[0] ?? column.machineId ?? null;
          const nameCandidate =
            machineNames[index] ?? machineNames[0] ?? column.machineName ?? null;
          const coercedId = coerceId(idCandidate);
          const coercedName = coerceName(nameCandidate);
          if (coercedId != null || coercedName != null) {
            sessionRows.push({
              user: undefined,
              machineId: coercedId,
              machineName: coercedName,
              durationMin: null,
              hours: null,
            });
          }
        }
      }

      map.set(column.key, sessionRows);
    });

    return map;
  }, [columns]);

  const getMachineRefs = useCallback(
    (columnKey: string) => {
      const rows = sessionRowsByColumnKey.get(columnKey) ?? [];
      return toMachineHeader(rows);
    },
    [sessionRowsByColumnKey],
  );

  const totalsByColumnKey = useMemo(() => {
    const map = new Map<string, number>();
    indexedColumns.forEach(({ column, index }) => {
      const rows = sessionRowsByColumnKey.get(column.key) ?? [];
      const hasDurations = rows.some(
        (row) => typeof row.durationMin === 'number' || typeof row.hours === 'number',
      );
      if (hasDurations) {
        map.set(column.key, sumColumnHours(rows));
        return;
      }
      let total = 0;
      for (const day of days) {
        const value = day.values[index];
        if (typeof value === 'number' && Number.isFinite(value)) {
          total += value;
        }
      }
      map.set(column.key, Math.round(total * 10) / 10);
    });
    return map;
  }, [days, indexedColumns, sessionRowsByColumnKey]);

  useEffect(() => {
    setEmployeeFilter((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const valid = prev.filter((name) => employeeOptions.includes(name));
      return valid.length === prev.length ? prev : valid;
    });
  }, [employeeOptions]);

  const selectedEmployeeSet = useMemo(() => new Set(employeeFilter), [employeeFilter]);
  const hasEmployeeFilter = selectedEmployeeSet.size > 0;

  const visibleColumnCount = useMemo(() => {
    if (!hasEmployeeFilter) {
      return indexedColumns.length;
    }
    const selected = new Set(employeeFilter);
    let count = 0;
    indexedColumns.forEach(({ column }) => {
      if (selected.has(column.userName)) {
        count += 1;
      }
    });
    return count;
  }, [employeeFilter, hasEmployeeFilter, indexedColumns]);

  const columnPaddingCount = Math.max(0, MIN_DYNAMIC_COLUMNS - visibleColumnCount);
  const tableStyle = useMemo(
    () =>
      ({
        '--reports-min-cols': String(Math.max(MIN_DYNAMIC_COLUMNS, visibleColumnCount || MIN_DYNAMIC_COLUMNS)),
      }) as CSSProperties & { '--reports-min-cols': string },
    [visibleColumnCount],
  );

  const exportUrl = useMemo(() => {
    if (!reportLoaded || !siteId || !monthValue) {
      return '';
    }
    const params = new URLSearchParams({
      month: monthValue,
      siteId,
    });
    const machineIds = machineFilter.map((value) => value.trim()).filter(Boolean);
    if (machineIds.length > 0) {
      params.set('machineIds', machineIds.join(','));
    }
    if (workTypeFilter !== 'all') {
      params.set('workType', workTypeFilter);
    }
    return `/api/reports/sites/export/excel?${params.toString()}`;
  }, [machineFilter, monthValue, reportLoaded, siteId, workTypeFilter]);


  const handleEmployeeFilterReset = () => {
    setEmployeeFilter([]);
  };


  async function loadReport() {
    if (!siteId || !Number.isFinite(year) || !Number.isFinite(month)) {
      return;
    }
    setLoading(true);
    setError(null);
    setReportLoaded(false);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        siteId,
      });
      machineFilter.forEach((id) => {
        const normalized = typeof id === 'string' ? id.trim() : String(id).trim();
        if (normalized) {
          params.append('machineIds', normalized);
        }
      });
      if (workTypeFilter !== 'all') {
        params.set('workType', workTypeFilter);
      }
      const response = await fetch(`/api/reports/sites?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`Failed to load report: ${response.status}`);
      }
      const data = (await response.json()) as ReportResponse;
      setColumns(Array.isArray(data.columns) ? data.columns : []);
      setDays(Array.isArray(data.days) ? data.days : []);
      setEmployeeFilter([]);
      if (data.site?.client) {
        setSiteClient(data.site.client);
      }
      setReportLoaded(true);
    } catch (err) {
      console.error('[reports][sites] failed to load report', err);
      setError('集計の取得に失敗しました。条件を確認して再試行してください。');
      setColumns([]);
      setDays([]);
    } finally {
      setLoading(false);
    }
  }

  const isReady = Boolean(siteId) && Number.isFinite(year) && Number.isFinite(month);

  return (
    <ReportPageShell>
      <div className="print-hide">
        <ReportsTabs />
      </div>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-brand-text">現場別集計</h1>
        <ReportFilterPanel className="print-hide">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-brand-muted">年月</span>
            <input
              type="month"
              className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-brand-text"
              value={monthValue}
              onChange={(event) => setMonthValue(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-brand-muted">現場名</span>
            <select
              className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-brand-text"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              <option value="">（選択してください）</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {toText(site.fields.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-brand-muted">元請・代理人（自動）</span>
            <input
              className="rounded border border-brand-border bg-brand-surface-alt px-3 py-2 text-brand-text"
              value={siteClient}
              placeholder="現場を選択すると自動入力"
              readOnly
            />
          </label>
          <div className="xl:col-span-2">
            <MachineCheckboxGroup
              options={machineOptions}
              value={machineFilter}
              onChange={setMachineFilter}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-brand-muted">常用/稼働/その他</span>
            <select
              className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-brand-text"
              value={workTypeFilter}
              onChange={(event) => {
                const next = event.target.value;
                setWorkTypeFilter(next === 'regular' || next === 'operating' || next === 'other' ? next : 'all');
              }}
            >
              <option value="all">（すべて）</option>
              <option value="regular">常用</option>
              <option value="operating">稼働</option>
              <option value="other">その他</option>
            </select>
          </label>
          </div>
        </ReportFilterPanel>
        <ReportActionBar className="print-hide">
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadReport}
            disabled={!isReady || loading}
            className="rounded bg-brand-primary px-4 py-2 text-brand-primaryText transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '集計中…' : '集計する'}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </ReportActionBar>
      </div>

      {reportLoaded ? (
        <div className="space-y-4">
          <ReportActionBar className="print-hide">
            <FilterChipGroup
              label="従業員名（複数選択可）"
              options={employeeOptions}
              value={employeeFilter}
              onChange={setEmployeeFilter}
            />
            <div className="flex flex-wrap items-start gap-3">
              <button
                type="button"
                onClick={handleEmployeeFilterReset}
                className="rounded border border-brand-border px-3 py-1 text-sm text-brand-text"
                disabled={!hasEmployeeFilter}
              >
                全員を表示
              </button>
              {exportUrl ? (
                <a
                  href={exportUrl}
                  className="rounded border border-brand-primary px-3 py-1 text-sm text-brand-primary hover:bg-brand-primary/10"
                >
                  Excel出力
                </a>
              ) : null}
            </div>
          </ReportActionBar>
          <div className="screen-table-wrapper">
            <div className="overflow-x-auto rounded border">
              <table className="table-unified text-sm print-avoid-break" style={tableStyle}>
                <thead>
                  <tr className="bg-gray-50">
                    <th className="col-narrow border px-2 py-1 text-right">年</th>
                    <th className="col-narrow border px-2 py-1 text-right">月</th>
                    <th className="col-narrow border px-2 py-1 text-right">日</th>
                    <th className="col-narrow border px-2 py-1 text-center">曜</th>
                    {indexedColumns.map(({ column }) => {
                      const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                      const className = hidden
                        ? 'border px-2 py-1 text-left screen-hidden'
                        : 'border px-2 py-1 text-left';
                      return (
                        <th key={`user-${column.key}`} className={className}>
                          {column.userName}
                        </th>
                      );
                    })}
                    {Array.from({ length: columnPaddingCount }).map((_, index) => (
                      <th key={`user-pad-${index}`} className="border px-2 py-1" aria-hidden="true" />
                    ))}
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="col-narrow border px-2 py-1" />
                    <th className="col-narrow border px-2 py-1" />
                    <th className="col-narrow border px-2 py-1" />
                    <th className="col-narrow border px-2 py-1" />
                    {indexedColumns.map(({ column }) => {
                      const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                      const className = hidden
                        ? 'border px-2 py-1 text-left screen-hidden'
                        : 'border px-2 py-1 text-left';
                      const machines = getMachineRefs(column.key);
                      return (
                        <th key={`work-${column.key}`} className={className}>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {machines.length > 0 ? (
                              machines.map((machine) => {
                                const machineCode =
                                  machine.machineId == null ? '' : String(machine.machineId).trim();
                                const machineName =
                                  typeof machine.machineName === 'string' ? machine.machineName.trim() : '';
                                const label =
                                  machineCode && machineName
                                    ? `${machineCode}/${machineName}`
                                    : machineCode || machineName || '—';
                                return (
                                  <span
                                    key={machine.machineId}
                                    className="max-w-[280px] truncate text-sm text-brand-text"
                                    title={label}
                                  >
                                    {label}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-sm text-brand-muted">—</span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    {Array.from({ length: columnPaddingCount }).map((_, index) => (
                      <th key={`work-pad-${index}`} className="border px-2 py-1" aria-hidden="true" />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((row) => {
                    const { year: rowYear, month: rowMonth, day, weekdayJp } = getJstParts(row.date);
                    return (
                      <tr key={row.date}>
                        <td className="col-narrow border px-2 py-1 text-right">{rowYear}</td>
                        <td className="col-narrow border px-2 py-1 text-right">{rowMonth}</td>
                        <td className="col-narrow border px-2 py-1 text-right">{day}</td>
                        <td className="col-narrow border px-2 py-1 text-center">{weekdayJp}</td>
                        {indexedColumns.map(({ column, index }) => {
                          const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                          const className = hidden
                            ? 'border px-2 py-1 text-right tabular-nums screen-hidden'
                            : 'border px-2 py-1 text-right tabular-nums';
                          return (
                            <td key={`${row.date}-${column.key}`} className={className}>
                              {formatQuarterHours(row.values[index])}
                            </td>
                          );
                        })}
                        {Array.from({ length: columnPaddingCount }).map((_, index) => (
                          <td key={`pad-${row.date}-${index}`} className="border px-2 py-1" aria-hidden="true" />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100">
                    <td className="col-narrow border px-2 py-1 font-semibold">稼働合計</td>
                    <td className="col-narrow border px-2 py-1" />
                    <td className="col-narrow border px-2 py-1" />
                    <td className="col-narrow border px-2 py-1" />
                    {indexedColumns.map(({ column }) => {
                      const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                      const baseClass = 'border px-2 py-1 text-right tabular-nums font-semibold';
                      const className = hidden ? `${baseClass} screen-hidden` : baseClass;
                      const total = totalsByColumnKey.get(column.key);
                      const safeTotal =
                        typeof total === 'number' && Number.isFinite(total) ? total : 0;
                      return (
                        <td key={`total-${column.key}`} className={className}>
                          {formatQuarterHours(safeTotal)}
                        </td>
                      );
                    })}
                    {Array.from({ length: columnPaddingCount }).map((_, index) => (
                      <td key={`total-pad-${index}`} className="border px-2 py-1" aria-hidden="true" />
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-brand-muted">条件を選択し「集計する」を押すと結果が表示されます。</p>
      )}
    </ReportPageShell>
  );
}
