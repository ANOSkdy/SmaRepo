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
  machineCode: string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const result = await inventoryQuery<InventoryCategoryRow>(
      `
        SELECT
          m.machine_code::text AS id,
          m.machine_code::text AS code,
          m.name,
          NULL::text AS description,
          0::integer AS "sortOrder",
          m.active AS "isActive",
          NOW()::text AS "createdAt",
          NOW()::text AS "updatedAt",
          m.machine_code::text AS "machineCode"
        FROM machines m
        WHERE m.machine_code IS NOT NULL
        ORDER BY m.machine_code ASC
      `,
    );

    return NextResponse.json(result.rows as InventoryCategory[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'MACHINE_BACKED_READ_ONLY' }, { status: 405 });
}
