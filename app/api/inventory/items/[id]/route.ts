import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import { inventoryItemUpdateSchema, normalizeNullableText } from '@/lib/inventory/schemas';

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
          i.category_id AS "categoryId",
          i.location_id::text AS "locationId",
          i.quantity,
          i.unit,
          i.image_url AS "imageUrl",
          i.image_path AS "imagePath",
          i.is_active AS "isActive",
          i.created_at::text AS "createdAt",
          i.updated_at::text AS "updatedAt",
          COALESCE(m.name, i.category_id) AS "categoryName",
          l.name AS "locationName"
        FROM inventory.items i
        LEFT JOIN machines m ON m.machine_code::text = i.category_id
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const routeParams = await context.params;
  const parsedParams = paramsSchema.safeParse(routeParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsedBody = inventoryItemUpdateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsedBody.data;
  const updates: string[] = [];
  const params: unknown[] = [];

  const setField = (sql: string, value: unknown) => {
    params.push(value);
    updates.push(`${sql} = $${params.length}`);
  };

  if (payload.sku !== undefined) setField('sku', payload.sku);
  if (payload.name !== undefined) setField('name', payload.name);
  if (payload.description !== undefined || payload.note !== undefined) {
    setField('description', normalizeNullableText(payload.note ?? payload.description));
  }
  if (payload.categoryId !== undefined) setField('category_id', payload.categoryId);
  if (payload.locationId !== undefined) setField('location_id', payload.locationId);
  if (payload.quantity !== undefined) setField('quantity', payload.quantity);
  if (payload.unit !== undefined) setField('unit', normalizeNullableText(payload.unit));
  if (payload.imageUrl !== undefined) setField('image_url', normalizeNullableText(payload.imageUrl));
  if (payload.imagePath !== undefined) setField('image_path', normalizeNullableText(payload.imagePath));
  if (payload.status !== undefined) setField('is_active', payload.status !== 'inactive');

  if (updates.length === 0) {
    return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });
  }

  params.push(parsedParams.data.id);

  try {
    const result = await inventoryQuery<{ id: string }>(
      `
        UPDATE inventory.items
        SET
          ${updates.join(', ')},
          updated_at = NOW()
        WHERE id = $${params.length}::uuid
        RETURNING id::text AS id
      `,
      params,
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ id: result.rows[0].id });
  } catch {
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
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
    const result = await inventoryQuery<{ id: string }>(
      `
        DELETE FROM inventory.items
        WHERE id = $1::uuid
        RETURNING id::text AS id
      `,
      [parsedParams.data.id],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ id: result.rows[0].id });
  } catch {
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
