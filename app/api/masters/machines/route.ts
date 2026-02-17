import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hasDatabaseUrl } from '@/lib/server-env';

export const runtime = 'nodejs';

type MachineRow = {
  id: string;
  fields: Record<string, unknown>;
};

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  try {
    const result = await query<MachineRow>(
      `
        SELECT
          COALESCE(
            payload->>'id',
            payload->>'machine_id',
            payload->>'machineId',
            payload->>'machineid',
            payload->>'record_id'
          ) AS id,
          payload AS fields
        FROM (
          SELECT to_jsonb(m) AS payload
          FROM machines m
        ) src
        WHERE CASE
          WHEN lower(COALESCE(payload->>'active', '')) IN ('1', 'true', 't', 'yes', 'on') THEN TRUE
          ELSE FALSE
        END
        ORDER BY
          COALESCE(
            NULLIF(payload->>'machineId', ''),
            NULLIF(payload->>'machineid', ''),
            NULLIF(payload->>'machine_id', ''),
            payload->>'id'
          ) ASC
      `,
    );

    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 });
  }
}
