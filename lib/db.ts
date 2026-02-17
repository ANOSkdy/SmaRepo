import 'server-only';

import { getDatabaseUrl } from '@/lib/server-env';

type QueryResultRow = Record<string, unknown>;

type QueryResult<T extends QueryResultRow = QueryResultRow> = {
  rows: T[];
  rowCount: number | null;
};

type PoolClient = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
  release: () => void;
};

type Pool = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
  connect: () => Promise<PoolClient>;
};

type DbClient = Pick<PoolClient, 'query'>;

type PgModule = {
  Pool: new (config: { connectionString: string }) => Pool;
};

let poolPromise: Promise<Pool> | null = null;

async function loadPgModule(): Promise<PgModule> {
  try {
    const moduleName = 'pg';
    const dynamicImport = import(moduleName) as Promise<PgModule>;
    return await dynamicImport;
  } catch {
    throw new Error('Postgres client is not available');
  }
}

async function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const databaseUrl = getDatabaseUrl();
      const { Pool } = await loadPgModule();

      return new Pool({
        connectionString: databaseUrl,
      });
    })();
  }

  return poolPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const pool = await getPool();
  return pool.query<T>(text, params);
}

export async function withClient<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
