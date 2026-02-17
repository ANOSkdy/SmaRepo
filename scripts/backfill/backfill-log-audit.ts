import fs from 'node:fs/promises';
import path from 'node:path';

import { getDatabaseUrlFromEnv, withClient } from '@/scripts/migrate/_shared';

type CliOptions = {
  dryRun: boolean;
  batch: number;
  max: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  onlyMissing: boolean;
};

type ColumnFlags = {
  hasDate: boolean;
  hasLatLon: boolean;
  hasDecisionMethod: boolean;
  hasDecidedSiteId: boolean;
  hasNearestDistanceM: boolean;
  hasSiteId: boolean;
  hasSiteLatLon: boolean;
  hasSiteGeom: boolean;
  hasSiteActive: boolean;
};

type RunSummary = {
  scanned: number;
  updated_nearest: number;
  updated_none: number;
  skipped_existing: number;
  no_site_found: number;
  missing_coords: number;
  errors: number;
  status: 'success' | 'failed';
  failure_reason: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let dryRun = false;
  let batch = 200;
  let max: number | null = null;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let onlyMissing = true;

  const readIntArg = (name: string, value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
  };

  const readDateArg = (name: string, value: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${name} must be YYYY-MM-DD`);
    }
    return value;
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token === '--only-missing') {
      onlyMissing = true;
      continue;
    }
    if (token === '--no-only-missing') {
      onlyMissing = false;
      continue;
    }
    if (token === '--batch') {
      const value = args[i + 1];
      if (!value) throw new Error('--batch requires a value');
      batch = readIntArg('--batch', value);
      i += 1;
      continue;
    }
    if (token === '--max') {
      const value = args[i + 1];
      if (!value) throw new Error('--max requires a value');
      max = readIntArg('--max', value);
      i += 1;
      continue;
    }
    if (token === '--date-from') {
      const value = args[i + 1];
      if (!value) throw new Error('--date-from requires a value');
      dateFrom = readDateArg('--date-from', value);
      i += 1;
      continue;
    }
    if (token === '--date-to') {
      const value = args[i + 1];
      if (!value) throw new Error('--date-to requires a value');
      dateTo = readDateArg('--date-to', value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('--date-from must be <= --date-to');
  }

  return { dryRun, batch, max, dateFrom, dateTo, onlyMissing };
}

function formatReportDir(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return path.join(process.cwd(), 'reports', 'backfill', timestamp);
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readColumns(table: 'logs' | 'sites'): Promise<Set<string>> {
  const result = await withClient((client) =>
    client.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
      `,
      [table],
    ),
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function buildLogsTargetWhere(flags: ColumnFlags, options: CliOptions, params: unknown[]): string {
  const conditions: string[] = [];

  if (flags.hasDate) {
    if (options.dateFrom) {
      params.push(options.dateFrom);
      conditions.push(`l."date" >= $${params.length}`);
    }
    if (options.dateTo) {
      params.push(options.dateTo);
      conditions.push(`l."date" <= $${params.length}`);
    }
  }

  if (!flags.hasLatLon) {
    throw new Error('logs table must have lat and lon columns');
  }

  conditions.push('l.lat IS NOT NULL');
  conditions.push('l.lon IS NOT NULL');

  if (options.onlyMissing) {
    const missingChecks: string[] = [];
    if (flags.hasDecidedSiteId) missingChecks.push('l.decided_site_id IS NULL');
    if (flags.hasDecisionMethod) missingChecks.push('l.decision_method IS NULL');
    if (flags.hasNearestDistanceM) missingChecks.push('l.nearest_distance_m IS NULL');

    if (missingChecks.length > 0) {
      conditions.push(`(${missingChecks.join(' OR ')})`);
    }
  }

  return conditions.length > 0 ? conditions.join(' AND ') : 'TRUE';
}

function buildMissingCoordWhere(flags: ColumnFlags, options: CliOptions, params: unknown[]): string {
  const conditions: string[] = [];

  if (flags.hasDate) {
    if (options.dateFrom) {
      params.push(options.dateFrom);
      conditions.push(`l."date" >= $${params.length}`);
    }
    if (options.dateTo) {
      params.push(options.dateTo);
      conditions.push(`l."date" <= $${params.length}`);
    }
  }

  conditions.push('l.lat IS NULL');
  conditions.push('l.lon IS NULL');

  if (flags.hasDecisionMethod) {
    if (options.onlyMissing) {
      conditions.push('l.decision_method IS NULL');
    } else {
      conditions.push("l.decision_method IS DISTINCT FROM 'none'");
    }
  }

  return conditions.join(' AND ');
}

function buildDistanceExpr(flags: ColumnFlags): string {
  if (flags.hasSiteGeom) {
    return `ST_DistanceSphere(ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326), s.geom)`;
  }

  return `
    6371000 * 2 * ASIN(
      SQRT(
        POWER(SIN(RADIANS(s.lat - t.lat) / 2), 2)
        + COS(RADIANS(t.lat)) * COS(RADIANS(s.lat))
        * POWER(SIN(RADIANS(s.lon - t.lon) / 2), 2)
      )
    )
  `;
}

function buildSiteFilter(flags: ColumnFlags): string {
  const filters: string[] = [];
  if (flags.hasSiteGeom) {
    filters.push('s.geom IS NOT NULL');
  } else if (flags.hasSiteLatLon) {
    filters.push('s.lat IS NOT NULL');
    filters.push('s.lon IS NOT NULL');
  }
  if (flags.hasSiteActive) {
    filters.push("lower(COALESCE(to_jsonb(s)->>'active', '')) IN ('1', 'true', 't', 'yes', 'on')");
  }
  return filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
}

async function writeReport(dirPath: string, options: CliOptions, summary: RunSummary): Promise<void> {
  const summaryJsonPath = path.join(dirPath, 'summary.json');
  const summaryMdPath = path.join(dirPath, 'summary.md');

  const payload = {
    generatedAt: new Date().toISOString(),
    args: options,
    ...summary,
  };

  const md = [
    '# Log audit backfill report',
    '',
    `- generatedAt: ${payload.generatedAt}`,
    `- status: ${summary.status}`,
    `- dryRun: ${options.dryRun}`,
    `- batch: ${options.batch}`,
    `- max: ${options.max ?? 'unlimited'}`,
    `- dateFrom: ${options.dateFrom ?? 'none'}`,
    `- dateTo: ${options.dateTo ?? 'none'}`,
    `- onlyMissing: ${options.onlyMissing}`,
    '',
    '## Counts',
    `- scanned: ${summary.scanned}`,
    `- updated_nearest: ${summary.updated_nearest}`,
    `- updated_none: ${summary.updated_none}`,
    `- skipped_existing: ${summary.skipped_existing}`,
    `- no_site_found: ${summary.no_site_found}`,
    `- missing_coords: ${summary.missing_coords}`,
    `- errors: ${summary.errors}`,
    `- failure_reason: ${summary.failure_reason ?? 'none'}`,
    '',
  ].join('\n');

  await fs.writeFile(summaryJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(summaryMdPath, md, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const reportDir = formatReportDir(new Date());
  await ensureDirectory(reportDir);

  const summary: RunSummary = {
    scanned: 0,
    updated_nearest: 0,
    updated_none: 0,
    skipped_existing: 0,
    no_site_found: 0,
    missing_coords: 0,
    errors: 0,
    status: 'success',
    failure_reason: null,
  };

  try {
    getDatabaseUrlFromEnv();

    const logColumns = await readColumns('logs');
    const siteColumns = await readColumns('sites');

    const flags: ColumnFlags = {
      hasDate: logColumns.has('date'),
      hasLatLon: logColumns.has('lat') && logColumns.has('lon'),
      hasDecisionMethod: logColumns.has('decision_method'),
      hasDecidedSiteId: logColumns.has('decided_site_id'),
      hasNearestDistanceM: logColumns.has('nearest_distance_m'),
      hasSiteId: siteColumns.has('id'),
      hasSiteLatLon: siteColumns.has('lat') && siteColumns.has('lon'),
      hasSiteGeom: siteColumns.has('geom'),
      hasSiteActive: siteColumns.has('active'),
    };

    if (!flags.hasSiteId) {
      throw new Error('sites table must have id column');
    }
    if (!flags.hasSiteGeom && !flags.hasSiteLatLon) {
      throw new Error('sites table must have geom or lat/lon columns');
    }

    const scannedParams: unknown[] = [];
    const scanWhere = buildLogsTargetWhere(flags, options, scannedParams);
    const scanResult = await withClient((client) =>
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.logs l WHERE ${scanWhere}`,
        scannedParams,
      ),
    );

    summary.scanned = Number(scanResult.rows[0]?.count ?? 0);

    if (options.onlyMissing) {
      const skippedParams: unknown[] = [];
      const skippedConditions: string[] = [];
      if (flags.hasDate) {
        if (options.dateFrom) {
          skippedParams.push(options.dateFrom);
          skippedConditions.push(`l."date" >= $${skippedParams.length}`);
        }
        if (options.dateTo) {
          skippedParams.push(options.dateTo);
          skippedConditions.push(`l."date" <= $${skippedParams.length}`);
        }
      }
      skippedConditions.push('l.lat IS NOT NULL');
      skippedConditions.push('l.lon IS NOT NULL');
      if (flags.hasDecisionMethod) skippedConditions.push('l.decision_method IS NOT NULL');
      if (flags.hasDecidedSiteId) skippedConditions.push('l.decided_site_id IS NOT NULL');
      if (flags.hasNearestDistanceM) skippedConditions.push('l.nearest_distance_m IS NOT NULL');

      const skippedResult = await withClient((client) =>
        client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM public.logs l WHERE ${skippedConditions.join(' AND ')}`,
          skippedParams,
        ),
      );
      summary.skipped_existing = Number(skippedResult.rows[0]?.count ?? 0);
    }

    const missingCoordParams: unknown[] = [];
    const missingCoordWhere = buildMissingCoordWhere(flags, options, missingCoordParams);
    const missingCountResult = await withClient((client) =>
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.logs l WHERE ${missingCoordWhere}`,
        missingCoordParams,
      ),
    );
    summary.missing_coords = Number(missingCountResult.rows[0]?.count ?? 0);

    if (!options.dryRun) {
      const noneSetters: string[] = [];
      if (flags.hasDecisionMethod) noneSetters.push(`decision_method = 'none'`);
      if (flags.hasDecidedSiteId) noneSetters.push('decided_site_id = NULL');
      if (flags.hasNearestDistanceM) noneSetters.push('nearest_distance_m = NULL');

      if (noneSetters.length > 0) {
        await withClient(async (client) => {
          await client.query('BEGIN');
          try {
            const result = await client.query<{ updated_none: string }>(
              `
                WITH targets AS (
                  SELECT l.ctid
                  FROM public.logs l
                  WHERE ${missingCoordWhere}
                ),
                updated AS (
                  UPDATE public.logs l
                  SET ${noneSetters.join(', ')}
                  FROM targets
                  WHERE l.ctid = targets.ctid
                  RETURNING 1
                )
                SELECT COUNT(*)::text AS updated_none
                FROM updated
              `,
              missingCoordParams,
            );
            await client.query('COMMIT');
            summary.updated_none += Number(result.rows[0]?.updated_none ?? 0);
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        });
      }
    }

    const distanceExpr = buildDistanceExpr(flags);
    const siteFilter = buildSiteFilter(flags);

    let processed = 0;

    while (true) {
      if (options.max != null && processed >= options.max) {
        break;
      }

      const nextBatchLimit = options.max == null ? options.batch : Math.min(options.batch, options.max - processed);
      if (nextBatchLimit <= 0) break;

      const batchParams: unknown[] = [nextBatchLimit];
      const targetWhere = buildLogsTargetWhere(flags, options, batchParams);

      if (options.dryRun) {
        const dryBatch = await withClient((client) =>
          client.query<{ count: string }>(
            `
              WITH targets AS (
                SELECT l.ctid, l.lat, l.lon
                FROM public.logs l
                WHERE ${targetWhere}
                ORDER BY l.ctid
                LIMIT $1
              )
              SELECT COUNT(*)::text AS count
              FROM targets
            `,
            batchParams,
          ),
        );

        const batchCount = Number(dryBatch.rows[0]?.count ?? 0);
        if (batchCount === 0) break;
        processed += batchCount;
        continue;
      }

      const result = await withClient(async (client) => {
        await client.query('BEGIN');
        try {
          const batchResult = await client.query<{
            updated_nearest: string;
            updated_none: string;
            no_site_found: string;
            batch_total: string;
          }>(
            `
              WITH targets AS (
                SELECT l.ctid, l.lat, l.lon
                FROM public.logs l
                WHERE ${targetWhere}
                ORDER BY l.ctid
                LIMIT $1
              ),
              nearest AS (
                SELECT
                  t.ctid,
                  n.site_id,
                  n.distance_m
                FROM targets t
                LEFT JOIN LATERAL (
                  SELECT
                    s.id AS site_id,
                    ${distanceExpr} AS distance_m
                  FROM public.sites s
                  ${siteFilter}
                  ORDER BY distance_m ASC, s.id ASC
                  LIMIT 1
                ) n ON TRUE
              ),
              updated AS (
                UPDATE public.logs l
                SET
                  ${flags.hasDecisionMethod ? `decision_method = CASE WHEN n.site_id IS NULL THEN 'none' ELSE 'nearest' END,` : ''}
                  ${flags.hasDecidedSiteId ? 'decided_site_id = n.site_id,' : ''}
                  ${flags.hasNearestDistanceM ? 'nearest_distance_m = CASE WHEN n.site_id IS NULL THEN NULL ELSE ROUND(n.distance_m)::integer END' : 'lat = l.lat'}
                FROM nearest n
                WHERE l.ctid = n.ctid
                RETURNING n.site_id
              )
              SELECT
                COUNT(*) FILTER (WHERE site_id IS NOT NULL)::text AS updated_nearest,
                COUNT(*) FILTER (WHERE site_id IS NULL)::text AS updated_none,
                COUNT(*) FILTER (WHERE site_id IS NULL)::text AS no_site_found,
                COUNT(*)::text AS batch_total
              FROM updated
            `,
            batchParams,
          );
          await client.query('COMMIT');
          return batchResult.rows[0] ?? {
            updated_nearest: '0',
            updated_none: '0',
            no_site_found: '0',
            batch_total: '0',
          };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });

      const batchTotal = Number(result.batch_total ?? 0);
      if (batchTotal === 0) break;

      summary.updated_nearest += Number(result.updated_nearest ?? 0);
      summary.updated_none += Number(result.updated_none ?? 0);
      summary.no_site_found += Number(result.no_site_found ?? 0);
      processed += batchTotal;
    }

    await writeReport(reportDir, options, summary);
    console.log(`[backfill:log-audit] completed: ${path.relative(process.cwd(), reportDir)}`);
  } catch (error) {
    summary.status = 'failed';
    summary.errors += 1;
    summary.failure_reason = error instanceof Error ? error.message : String(error);

    await writeReport(reportDir, options, summary);
    console.error('[backfill:log-audit] failed', summary.failure_reason);
    process.exitCode = 1;
  }
}

void main();
