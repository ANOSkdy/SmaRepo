import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import type { InventoryLocation } from '@/types/inventory';

export const runtime = 'nodejs';

type InventoryLocationRow = {
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
    const result = await inventoryQuery<InventoryLocationRow>(
      `
        SELECT
          l.id::text AS id,
          l.code,
          l.name,
          l.description,
          l.sort_order AS "sortOrder",
          l.is_active AS "isActive",
          l.created_at::text AS "createdAt",
          l.updated_at::text AS "updatedAt"
        FROM inventory.locations l
        WHERE l.is_active = TRUE
        ORDER BY l.sort_order ASC, l.name ASC
      `,
    );

    return NextResponse.json(result.rows as InventoryLocation[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}
