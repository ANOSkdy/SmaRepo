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
        SELECT
          c.id::text AS id,
          c.code,
          c.name,
          c.description,
          c.sort_order AS "sortOrder",
          c.is_active AS "isActive",
          c.created_at::text AS "createdAt",
          c.updated_at::text AS "updatedAt"
        FROM inventory.categories c
        WHERE c.is_active = TRUE
        ORDER BY c.sort_order ASC, c.name ASC
      `,
    );

    return NextResponse.json(result.rows as InventoryCategory[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}
