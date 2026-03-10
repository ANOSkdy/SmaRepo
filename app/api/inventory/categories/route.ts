import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import type { InventoryCategory } from '@/types/inventory';

export const runtime = 'nodejs';

type InventoryCategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const result = await inventoryQuery<InventoryCategoryRow>(
      `
        WITH machine_rows AS (
          SELECT
            COALESCE(
              NULLIF(payload->>'machine_code', ''),
              NULLIF(payload->>'machineid', ''),
              NULLIF(payload->>'machine_id', '')
            ) AS machine_code,
            COALESCE(
              NULLIF(payload->>'name', ''),
              NULLIF(payload->>'machine_name', ''),
              NULLIF(payload->>'machineName', '')
            ) AS machine_name,
            CASE
              WHEN lower(COALESCE(payload->>'active', 'true')) IN ('1', 'true', 't', 'yes', 'on') THEN TRUE
              WHEN lower(COALESCE(payload->>'active', 'true')) IN ('0', 'false', 'f', 'no', 'off') THEN FALSE
              ELSE TRUE
            END AS is_active
          FROM (
            SELECT to_jsonb(m) AS payload
            FROM machines m
          ) src
        )
        SELECT
          m.machine_code AS id,
          m.machine_code AS code,
          COALESCE(m.machine_name, m.machine_code) AS name,
          NULL::text AS description,
          0::integer AS "sortOrder",
          m.is_active AS "isActive",
          NOW()::text AS "createdAt",
          NOW()::text AS "updatedAt"
        FROM machine_rows m
        WHERE m.machine_code IS NOT NULL
        ORDER BY m.machine_code ASC
      `,
    );

    return NextResponse.json(result.rows as InventoryCategory[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}
