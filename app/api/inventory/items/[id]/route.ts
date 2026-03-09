import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type InventoryItemDetailRow = {
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const routeParams = await context.params;
  const parsedParams = paramsSchema.safeParse(routeParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  try {
    const result = await inventoryQuery<InventoryItemDetailRow>(
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
        WHERE i.id = $1
        LIMIT 1
      `,
      [parsedParams.data.id],
    );

    const item = result.rows[0];
    if (!item) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}
