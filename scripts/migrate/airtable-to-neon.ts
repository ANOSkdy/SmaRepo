import path from 'node:path';

import {
  fetchAirtableRows,
  getDatabaseUrlFromEnv,
  listColumns,
  normalizeRow,
  parseCliArgs,
  parseTablesArg,
  pickConflictKeys,
  readCsvRows,
  TABLE_ORDER,
  type SourceKind,
  upsertBatch,
} from './_shared';

const DEFAULT_BATCH_SIZE = 200;

async function migrateTable(params: {
  table: (typeof TABLE_ORDER)[number];
  source: SourceKind;
  inputDir: string;
  dryRun: boolean;
  limit?: number;
  since?: string;
}): Promise<{ sourceCount: number; importedCount: number; skippedCount: number }> {
  const columns = await listColumns(params.table);
  const allowedColumns = new Set(columns);
  const conflictKeys = pickConflictKeys(params.table, allowedColumns);

  if (conflictKeys.length === 0) {
    throw new Error(`Cannot determine UPSERT conflict keys for table ${params.table}`);
  }

  const sourceRows =
    params.source === 'csv'
      ? await readCsvRows(params.inputDir, params.table)
      : await fetchAirtableRows({ table: params.table, limit: params.limit, since: params.since });

  const sliced = typeof params.limit === 'number' && params.limit > 0 ? sourceRows.slice(0, params.limit) : sourceRows;
  const normalized = sliced
    .map((row) => normalizeRow(row, allowedColumns))
    .filter((row) => Object.keys(row).length > 0)
    .filter((row) => conflictKeys.every((key) => row[key] != null));

  let importedCount = 0;

  for (let index = 0; index < normalized.length; index += DEFAULT_BATCH_SIZE) {
    const batch = normalized.slice(index, index + DEFAULT_BATCH_SIZE);
    await upsertBatch({
      table: params.table,
      rows: batch,
      conflictKeys,
      dryRun: params.dryRun,
    });
    importedCount += batch.length;
    console.log(`[migrate] ${params.table}: ${importedCount}/${normalized.length}`);
  }

  return {
    sourceCount: sliced.length,
    importedCount,
    skippedCount: sliced.length - normalized.length,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const source = (args.source ?? 'csv') as SourceKind;
  const dryRun = Boolean(args['dry-run']);
  const limit = typeof args.limit === 'string' ? Number(args.limit) : undefined;
  const since = typeof args.since === 'string' ? args.since : undefined;
  const inputDirRaw = typeof args.inputDir === 'string' ? args.inputDir : 'data/migration';
  const inputDir = path.isAbsolute(inputDirRaw) ? inputDirRaw : path.join(process.cwd(), inputDirRaw);
  const tables = parseTablesArg(typeof args.tables === 'string' ? args.tables : undefined);

  try {
    getDatabaseUrlFromEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Database env validation failed: ${message}`);
  }

  if (source !== 'csv' && source !== 'airtable') {
    throw new Error('--source must be csv or airtable');
  }

  console.log(`[migrate] start source=${source} dryRun=${dryRun} tables=${tables.join(',')}`);

  for (const table of TABLE_ORDER) {
    if (!tables.includes(table)) continue;

    const result = await migrateTable({
      table,
      source,
      inputDir,
      dryRun,
      limit: Number.isFinite(limit) ? limit : undefined,
      since,
    });

    console.log(
      `[migrate] done ${table}: source=${result.sourceCount} imported=${result.importedCount} skipped=${result.skippedCount}`,
    );
  }

  console.log('[migrate] completed');
}

main().catch((error) => {
  console.error('[migrate] failed', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
