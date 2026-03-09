import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import type { InventoryItemListEntry } from '@/types/inventory';

export const runtime = 'nodejs';

const inventoryItemsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
});

type InventoryItemListRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  locationId: string;
  quantity: number;
  unit: string | null;
  imageUrl: string | null;
  imagePath: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  categoryName: string;
  locationName: string;
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = inventoryItemsQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    categoryId: url.searchParams.get('categoryId') ?? undefined,
    locationId: url.searchParams.get('locationId') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_QUERY' }, { status: 400 });
  }

  const { q, categoryId, locationId } = parsed.data;

  const params: unknown[] = [];
  let whereClause = 'WHERE i.is_active = TRUE';

  if (q) {
    params.push(`%${q}%`);
    whereClause += ` AND (i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length})`;
  }

  if (categoryId) {
    params.push(categoryId);
    whereClause += ` AND i.category_id = $${params.length}`;
  }

  if (locationId) {
    params.push(locationId);
    whereClause += ` AND i.location_id = $${params.length}`;
  }

  try {
    const result = await inventoryQuery<InventoryItemListRow>(
      `
        SELECT
          i.id::text AS id,
          i.sku,
          i.name,
          i.description,
          i.category_id::text AS "categoryId",
          i.location_id::text AS "locationId",
          i.quantity,
          i.unit,
          i.image_url AS "imageUrl",
          i.image_path AS "imagePath",
          i.is_active AS "isActive",
          i.created_at::text AS "createdAt",
          i.updated_at::text AS "updatedAt",
          c.name AS "categoryName",
          l.name AS "locationName"
        FROM inventory.items i
        JOIN inventory.categories c ON c.id = i.category_id
        JOIN inventory.locations l ON l.id = i.location_id
        ${whereClause}
        ORDER BY i.name ASC
      `,
      params,
    );

    return NextResponse.json(result.rows as InventoryItemListEntry[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}
