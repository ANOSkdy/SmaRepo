import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hasDatabaseUrl } from '@/lib/server-env';

export const runtime = 'nodejs';

type WorkTypeRow = {
  id: string;
  fields: Record<string, unknown>;
};

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  try {
    const result = await query<WorkTypeRow>(
      `
        SELECT
          COALESCE(
            payload->>'id',
            payload->>'work_type_id',
            payload->>'workTypeId',
            payload->>'work_id',
            payload->>'workId',
            payload->>'record_id'
          ) AS id,
          payload AS fields
        FROM (
          SELECT to_jsonb(w) AS payload
          FROM work_types w
        ) src
        WHERE CASE
          WHEN lower(COALESCE(payload->>'active', '')) IN ('1', 'true', 't', 'yes', 'on') THEN TRUE
          ELSE FALSE
        END
        ORDER BY
          COALESCE((NULLIF(payload->>'sortOrder', ''))::int, (NULLIF(payload->>'sort_order', ''))::int, 2147483647) ASC,
          COALESCE(NULLIF(payload->>'workId', ''), NULLIF(payload->>'work_id', ''), payload->>'id') ASC
      `,
    );

    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 });
  }
}
