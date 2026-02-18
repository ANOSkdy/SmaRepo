import 'server-only';

import { query } from '@/lib/db';
import { hasDatabaseUrl } from '@/lib/server-env';

type DbHealthResponse = {
  ok: boolean;
  connected: boolean;
  tables: Record<string, boolean>;
  columns: Record<string, boolean>;
  error?: string;
};

const REQUIRED_TABLES = ['users', 'machines', 'sites', 'work_types', 'logs', 'sessions'] as const;

const REQUIRED_COLUMNS = [
  { table: 'logs', column: 'date' },
  { table: 'sites', column: 'lat' },
  { table: 'sites', column: 'lon' },
  { table: 'sessions', column: 'status' },
] as const;

export async function getDatabaseHealth(): Promise<DbHealthResponse> {
  const tables = Object.fromEntries(REQUIRED_TABLES.map((table) => [table, false]));
  const columns = Object.fromEntries(REQUIRED_COLUMNS.map(({ table, column }) => [`${table}.${column}`, false]));

  if (!hasDatabaseUrl()) {
    return {
      ok: false,
      connected: false,
      tables,
      columns,
      error: 'DB env missing',
    };
  }

  try {
    await query('SELECT 1 AS ok');

    const tableResult = await query<{ tableName: string; present: boolean }>(
      `
        SELECT
          req.table_name AS "tableName",
          (to_regclass(format('public.%I', req.table_name)) IS NOT NULL) AS present
        FROM unnest($1::text[]) AS req(table_name)
      `,
      [REQUIRED_TABLES],
    );

    for (const row of tableResult.rows) {
      tables[row.tableName] = row.present;
    }

    const columnResult = await query<{ tableName: string; columnName: string; present: boolean }>(
      `
        SELECT
          req.table_name AS "tableName",
          req.column_name AS "columnName",
          EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = req.table_name
              AND c.column_name = req.column_name
          ) AS present
        FROM unnest($1::text[], $2::text[]) AS req(table_name, column_name)
      `,
      [
        REQUIRED_COLUMNS.map(({ table }) => table),
        REQUIRED_COLUMNS.map(({ column }) => column),
      ],
    );

    for (const row of columnResult.rows) {
      columns[`${row.tableName}.${row.columnName}`] = row.present;
    }

    const ok = Object.values(tables).every(Boolean) && Object.values(columns).every(Boolean);

    return {
      ok,
      connected: true,
      tables,
      columns,
    };
  } catch {
    return {
      ok: false,
      connected: false,
      tables,
      columns,
      error: 'DB connection failed',
    };
  }
}
