import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import { inventoryMasterCreateSchema, normalizeNullableText } from '@/lib/inventory/schemas';
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
        ORDER BY l.sort_order ASC, l.name ASC
      `,
    );

    return NextResponse.json(result.rows as InventoryLocation[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = inventoryMasterCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    const result = await inventoryQuery<{ id: string }>(
      `
      INSERT INTO inventory.locations (code, name, description, sort_order, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id::text AS id
      `,
      [payload.code, payload.name, normalizeNullableText(payload.description), payload.sortOrder, payload.isActive],
    );

    return NextResponse.json({ id: result.rows[0]?.id ?? null }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
