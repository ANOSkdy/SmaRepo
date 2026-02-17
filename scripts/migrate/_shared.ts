import fs from 'node:fs/promises';
import path from 'node:path';

import { normalizePostgresConnectionString } from '@/lib/postgres-connection';

export type SourceKind = 'csv' | 'airtable';

export type TableName = 'users' | 'machines' | 'sites' | 'work_types' | 'logs' | 'sessions';

type QueryRow = Record<string, unknown>;

type DbClient = {
  query: <T extends QueryRow = QueryRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

type PgPool = {
  query: <T extends QueryRow = QueryRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  connect: () => Promise<{ query: DbClient['query']; release: () => void }>;
};

let pool: PgPool | null = null;

export const TABLE_ORDER: TableName[] = ['users', 'machines', 'sites', 'work_types', 'logs', 'sessions'];

export function getDatabaseUrlFromEnv(): string {
  const raw = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
  if (!raw) {
    throw new Error('DB env missing: DATABASE_URL or NEON_DATABASE_URL');
  }
  return normalizePostgresConnectionString(raw);
}

async function getPool(): Promise<PgPool> {
  if (!pool) {
    let PgPoolCtor: new (config: { connectionString: string }) => PgPool;
    try {
      const pgModule = (await import('pg')) as { Pool: typeof PgPoolCtor };
      PgPoolCtor = pgModule.Pool;
    } catch {
      throw new Error('Postgres client is not available. Install dependencies and ensure \"pg\" is present.');
    }
    pool = new PgPoolCtor({ connectionString: getDatabaseUrlFromEnv() });
  }
  return pool;
}

export async function query<T extends QueryRow = QueryRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  const dbPool = await getPool();
  return dbPool.query<T>(text, params);
}

export async function withClient<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const dbPool = await getPool();
  const client = await dbPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export const INPUT_FILE_PREFIXES: Record<TableName, string[]> = {
  users: ['Users'],
  machines: ['Machines'],
  sites: ['Sites'],
  work_types: ['WorkTypes'],
  logs: ['Logs'],
  sessions: ['Sessions'],
};

const NUMBER_KEYS = new Set(['id', 'user_id', 'machine_id', 'site_id', 'decided_site_id', 'duration_min', 'sort_order', 'lat', 'lon', 'accuracy']);
const BOOLEAN_KEYS = new Set(['active', 'auto_generated']);
const TIMESTAMP_KEYS = new Set(['timestamp', 'timestamp_utc', 'start_at', 'end_at', 'created_at', 'updated_at']);
const DATE_KEYS = new Set(['date']);

export async function listColumns(table: TableName): Promise<string[]> {
  const result = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position ASC`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

export async function parseCsvFile(filePath: string): Promise<Record<string, string>[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw.replace(/^\ufeff/, '').split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = fields[index] ?? '';
    return row;
  });
}

export function normalizeRow(row: Record<string, unknown>, allowedColumns: Set<string>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!allowedColumns.has(key)) continue;
    if (value == null) {
      normalized[key] = null;
      continue;
    }
    if (typeof value !== 'string') {
      normalized[key] = value;
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      normalized[key] = null;
    } else if (NUMBER_KEYS.has(key)) {
      const parsed = Number(trimmed);
      normalized[key] = Number.isFinite(parsed) ? parsed : null;
    } else if (BOOLEAN_KEYS.has(key)) {
      normalized[key] = ['1', 'true', 'yes', 'on', 't'].includes(trimmed.toLowerCase());
    } else if (TIMESTAMP_KEYS.has(key)) {
      const ms = Date.parse(trimmed);
      normalized[key] = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    } else if (DATE_KEYS.has(key)) {
      normalized[key] = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
    } else {
      normalized[key] = trimmed;
    }
  }
  return normalized;
}

export async function readCsvRows(inputDir: string, table: TableName): Promise<Record<string, unknown>[]> {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
    .map((entry) => entry.name)
    .filter((name) => INPUT_FILE_PREFIXES[table].some((prefix) => name.toLowerCase().startsWith(prefix.toLowerCase())))
    .sort((a, b) => a.localeCompare(b));

  const rows: Record<string, unknown>[] = [];
  for (const file of files) rows.push(...(await parseCsvFile(path.join(inputDir, file))));
  return rows;
}

export async function upsertBatch(params: { table: TableName; rows: Record<string, unknown>[]; conflictKeys: string[]; dryRun: boolean }): Promise<void> {
  const { table, rows, conflictKeys, dryRun } = params;
  if (rows.length === 0 || conflictKeys.length === 0) return;

  const allColumns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (allColumns.length === 0) return;
  const values: unknown[] = [];
  const matrix = rows
    .map((row, rowIndex) => `(${allColumns.map((column, colIndex) => {
      values.push(row[column] ?? null);
      return `$${rowIndex * allColumns.length + colIndex + 1}`;
    }).join(', ')})`)
    .join(', ');
  const updates = allColumns.filter((column) => !conflictKeys.includes(column));
  const sql = `INSERT INTO public.${table} (${allColumns.map((c) => `"${c}"`).join(', ')}) VALUES ${matrix} ON CONFLICT (${conflictKeys.map((c) => `"${c}"`).join(', ')}) ${updates.length ? `DO UPDATE SET ${updates.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')}` : 'DO NOTHING'}`;

  if (dryRun) return;

  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(sql, values);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export function parseTablesArg(value: string | undefined): TableName[] {
  if (!value) return [...TABLE_ORDER];
  const tokens = value.split(',').map((token) => token.trim()).filter(Boolean) as TableName[];
  const valid = new Set(TABLE_ORDER);
  const selected = tokens.filter((token): token is TableName => valid.has(token));
  if (!selected.length) throw new Error(`No valid tables in --tables. Supported: ${TABLE_ORDER.join(', ')}`);
  return TABLE_ORDER.filter((table) => selected.includes(table));
}

export function pickConflictKeys(table: TableName, availableColumns: Set<string>): string[] {
  const candidates: Record<TableName, string[][]> = {
    users: [['id'], ['user_id'], ['username']],
    machines: [['id'], ['machine_id'], ['machineid']],
    sites: [['id'], ['site_id'], ['siteid']],
    work_types: [['id'], ['work_id']],
    logs: [['unique_key'], ['id']],
    sessions: [['unique_key'], ['id']],
  };
  for (const keys of candidates[table]) if (keys.every((key) => availableColumns.has(key))) return keys;
  return [];
}

export async function fetchAirtableRows(params: { table: TableName; limit?: number; since?: string }): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new Error('Airtable env missing: AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required for --source airtable');

  const tableNameMap: Record<TableName, string> = {
    users: 'Users',
    machines: 'Machines',
    sites: 'Sites',
    work_types: 'WorkTypes',
    logs: 'Logs',
    sessions: 'Sessions',
  };

  const rows: Record<string, unknown>[] = [];
  let offset = '';
  while (true) {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableNameMap[params.table])}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    if (params.since && (params.table === 'logs' || params.table === 'sessions')) {
      url.searchParams.set('filterByFormula', `IS_AFTER({timestamp}, '${params.since}')`);
    }

    const payload = await fetchWithBackoff(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
    const records = (payload.records as Array<{ id: string; fields: Record<string, unknown> }>) ?? [];
    for (const record of records) {
      rows.push({ id: record.id, ...record.fields });
      if (params.limit && rows.length >= params.limit) return rows;
    }

    const next = payload.offset;
    if (typeof next !== 'string' || !next) break;
    offset = next;
  }

  return rows;
}

async function fetchWithBackoff(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) return (await response.json()) as Record<string, unknown>;
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
      continue;
    }
    throw new Error(`Airtable fetch failed with status ${response.status}`);
  }
  throw new Error('Airtable fetch failed after retries');
}

export function parseCliArgs(argv: string[]): Record<string, string | boolean | undefined> {
  const args: Record<string, string | boolean | undefined> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawFlag, rawValue] = token.split('=');
    const flag = rawFlag.slice(2);
    if (rawValue != null) args[flag] = rawValue;
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) args[flag] = true;
    else {
      args[flag] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function buildReportDir(now: Date): string {
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  return path.join(process.cwd(), 'reports', 'migration', ts);
}
