import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { hasDatabaseUrl } from '@/lib/server-env';
import { fetchSessionReportRows } from '@/src/lib/sessions-reports';

export const runtime = 'nodejs';

type SearchParams = {
  year: number;
  month: number;
  sitename?: string;
  username?: string;
  machinename?: string;
};

function parseIntParam(value: string | null, name: string): number {
  if (!value) throw new Error(`${name} is required`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function normalizeQuery(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function includesFilter(value: string | null | undefined, query?: string): boolean {
  if (!query) return true;
  if (!value) return false;
  return value.toLocaleLowerCase('ja').includes(query.toLocaleLowerCase('ja'));
}

function parseSearchParams(request: NextRequest): SearchParams {
  const url = request.nextUrl;
  const year = parseIntParam(url.searchParams.get('year'), 'year');
  const month = parseIntParam(url.searchParams.get('month'), 'month');
  if (month < 1 || month > 12) throw new Error('month must be between 1 and 12');
  return {
    year,
    month,
    sitename: normalizeQuery(url.searchParams.get('sitename')),
    username: normalizeQuery(url.searchParams.get('username')),
    machinename: normalizeQuery(url.searchParams.get('machinename')),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!hasDatabaseUrl()) {
    return Response.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  let params: SearchParams;
  try {
    params = parseSearchParams(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid parameters';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  try {
    const rows = await fetchSessionReportRows({ year: params.year, month: params.month });
    const records = rows
      .filter((row) => includesFilter(row.siteName, params.sitename))
      .filter((row) => includesFilter(row.userName, params.username))
      .filter((row) => includesFilter(row.machineName ?? row.machineId, params.machinename))
      .map((row) => ({
        id: row.id,
        date: row.date,
        username: row.userName,
        sitename: row.siteName ?? '',
        machinename: row.machineName ?? row.machineId ?? '',
        workdescription: row.workDescription ?? '',
        hours: row.hours ?? 0,
      }));

    return Response.json({ ok: true, records });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'search failed';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
