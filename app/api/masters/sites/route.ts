import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hasDatabaseUrl } from '@/lib/server-env';

export const runtime = 'nodejs';

type SiteRow = {
  id: string;
  fields: Record<string, unknown>;
};

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  try {
    const result = await query<SiteRow>(
      `
        SELECT
          COALESCE(
            payload->>'id',
            payload->>'site_id',
            payload->>'siteId',
            payload->>'record_id'
          ) AS id,
          payload AS fields
        FROM (
          SELECT to_jsonb(s) AS payload
          FROM sites s
        ) src
        WHERE CASE
          WHEN lower(COALESCE(payload->>'active', '')) IN ('1', 'true', 't', 'yes', 'on') THEN TRUE
          ELSE FALSE
        END
        ORDER BY
          COALESCE(NULLIF(payload->>'site_id', ''), NULLIF(payload->>'siteId', ''), payload->>'id') ASC
      `,
    );

    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 });
  }
}
