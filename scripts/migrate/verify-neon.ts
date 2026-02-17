import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildReportDir,
  ensureDirectory,
  parseCliArgs,
  parseTablesArg,
  readCsvRows,
  TABLE_ORDER,
  getDatabaseUrlFromEnv,
  query,
  type TableName,
} from './_shared';

type CountResult = {
  sourceCount: number | null;
  neonCount: number;
  diff: number | null;
};

async function countTableRows(table: TableName): Promise<number> {
  const result = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM public.${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function detectDuplicateCount(table: TableName): Promise<{ key: string; duplicates: number }> {
  const keyCandidates: Record<TableName, string[]> = {
    users: ['id', 'user_id', 'username'],
    machines: ['id', 'machine_id', 'machineid'],
    sites: ['id', 'site_id', 'siteid'],
    work_types: ['id', 'work_id'],
    logs: ['unique_key', 'id'],
    sessions: ['unique_key', 'id'],
  };

  for (const candidate of keyCandidates[table]) {
    const exists = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        ) AS exists
      `,
      [table, candidate],
    );

    if (!exists.rows[0]?.exists) continue;

    const duplicateResult = await query<{ duplicates: string }>(
      `
        SELECT COUNT(*)::text AS duplicates
        FROM (
          SELECT "${candidate}", COUNT(*)
          FROM public.${table}
          WHERE "${candidate}" IS NOT NULL
          GROUP BY "${candidate}"
          HAVING COUNT(*) > 1
        ) AS dup
      `,
    );

    return {
      key: candidate,
      duplicates: Number(duplicateResult.rows[0]?.duplicates ?? 0),
    };
  }

  return { key: 'n/a', duplicates: -1 };
}

async function orphanCount(sql: string): Promise<number> {
  const result = await query<{ count: string }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function runIntegrityChecks(): Promise<Record<string, number>> {
  return {
    logs_user_orphans: await orphanCount(
      'SELECT COUNT(*)::text AS count FROM public.logs l LEFT JOIN public.users u ON l.user_id = u.id WHERE l.user_id IS NOT NULL AND u.id IS NULL',
    ),
    logs_machine_orphans: await orphanCount(
      'SELECT COUNT(*)::text AS count FROM public.logs l LEFT JOIN public.machines m ON l.machine_id = m.id WHERE l.machine_id IS NOT NULL AND m.id IS NULL',
    ),
    logs_site_orphans: await orphanCount(
      'SELECT COUNT(*)::text AS count FROM public.logs l LEFT JOIN public.sites s ON l.decided_site_id = s.id WHERE l.decided_site_id IS NOT NULL AND s.id IS NULL',
    ),
    sessions_user_orphans: await orphanCount(
      'SELECT COUNT(*)::text AS count FROM public.sessions s LEFT JOIN public.users u ON s.user_id = u.id WHERE s.user_id IS NOT NULL AND u.id IS NULL',
    ),
    sessions_machine_orphans: await orphanCount(
      'SELECT COUNT(*)::text AS count FROM public.sessions s LEFT JOIN public.machines m ON s.machine_id = m.id WHERE s.machine_id IS NOT NULL AND m.id IS NULL',
    ),
  };
}

async function runInvariantChecks(): Promise<Record<string, number>> {
  return {
    logs_negative_duration: await orphanCount('SELECT COUNT(*)::text AS count FROM public.logs WHERE duration_min < 0'),
    sessions_negative_duration: await orphanCount('SELECT COUNT(*)::text AS count FROM public.sessions WHERE duration_min < 0'),
    logs_invalid_date_format: await orphanCount(
      "SELECT COUNT(*)::text AS count FROM public.logs WHERE date IS NOT NULL AND date::text !~ '^\\d{4}-\\d{2}-\\d{2}$'",
    ),
    sessions_invalid_date_format: await orphanCount(
      "SELECT COUNT(*)::text AS count FROM public.sessions WHERE date IS NOT NULL AND date::text !~ '^\\d{4}-\\d{2}-\\d{2}$'",
    ),
    logs_unparseable_timestamp: await orphanCount(
      "SELECT COUNT(*)::text AS count FROM public.logs WHERE timestamp IS NOT NULL AND timestamp::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'",
    ),
    sessions_unparseable_timestamp: await orphanCount(
      "SELECT COUNT(*)::text AS count FROM public.sessions WHERE timestamp IS NOT NULL AND timestamp::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'",
    ),
  };
}

async function tryCountSourceRows(inputDir: string, table: TableName): Promise<number | null> {
  try {
    const rows = await readCsvRows(inputDir, table);
    return rows.length;
  } catch {
    return null;
  }
}

function renderMarkdown(report: {
  generatedAt: string;
  counts: Record<string, CountResult>;
  duplicates: Record<string, { key: string; duplicates: number }>;
  integrity: Record<string, number>;
  invariants: Record<string, number>;
}): string {
  const lines = ['# Migration verification report', '', `Generated at: ${report.generatedAt}`, ''];

  lines.push('## Counts');
  for (const [table, entry] of Object.entries(report.counts)) {
    lines.push(
      `- ${table}: source=${entry.sourceCount ?? 'n/a'} neon=${entry.neonCount} diff=${entry.diff ?? 'n/a'}`,
    );
  }

  lines.push('', '## Duplicates');
  for (const [table, duplicate] of Object.entries(report.duplicates)) {
    lines.push(`- ${table}: key=${duplicate.key} duplicates=${duplicate.duplicates}`);
  }

  lines.push('', '## Referential integrity');
  for (const [name, value] of Object.entries(report.integrity)) {
    lines.push(`- ${name}: ${value}`);
  }

  lines.push('', '## Invariants');
  for (const [name, value] of Object.entries(report.invariants)) {
    lines.push(`- ${name}: ${value}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const inputDirRaw = typeof args.inputDir === 'string' ? args.inputDir : 'data/migration';
  const inputDir = path.isAbsolute(inputDirRaw) ? inputDirRaw : path.join(process.cwd(), inputDirRaw);
  const tables = parseTablesArg(typeof args.tables === 'string' ? args.tables : undefined);

  try {
    getDatabaseUrlFromEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Database env validation failed: ${message}`);
  }

  const counts: Record<string, CountResult> = {};
  for (const table of TABLE_ORDER) {
    if (!tables.includes(table)) continue;
    const neonCount = await countTableRows(table);
    const sourceCount = await tryCountSourceRows(inputDir, table);
    counts[table] = {
      sourceCount,
      neonCount,
      diff: sourceCount == null ? null : neonCount - sourceCount,
    };
  }

  const duplicates: Record<string, { key: string; duplicates: number }> = {};
  for (const table of TABLE_ORDER) {
    if (!tables.includes(table)) continue;
    duplicates[table] = await detectDuplicateCount(table);
  }

  const integrity = await runIntegrityChecks();
  const invariants = await runInvariantChecks();

  const report = {
    generatedAt: new Date().toISOString(),
    counts,
    duplicates,
    integrity,
    invariants,
  };

  const reportDir = buildReportDir(new Date());
  await ensureDirectory(reportDir);

  const jsonPath = path.join(reportDir, 'report.json');
  const markdownPath = path.join(reportDir, 'report.md');

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, renderMarkdown(report), 'utf8');

  console.log(`[verify] report generated: ${path.relative(process.cwd(), reportDir)}`);
}

main().catch((error) => {
  console.error('[verify] failed', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
