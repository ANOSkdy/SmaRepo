import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import { inventoryItemCreateSchema, normalizeNullableText } from '@/lib/inventory/schemas';
import type { InventoryItemListEntry } from '@/types/inventory';

export const runtime = 'nodejs';

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

type DbError = {
  code?: string;
  table?: string;
  column?: string;
  constraint?: string;
  message?: string;
};

type CreateDiagnostics = {
  debugId: string;
  sku: string;
  categoryId: string;
  locationId: string;
  hasImageUrl: boolean;
  hasImagePath: boolean;
  quantity: number;
};

function toSafeDbError(error: unknown): DbError {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const maybe = error as DbError;
  return {
    code: maybe.code,
    table: maybe.table,
    column: maybe.column,
    constraint: maybe.constraint,
    message: maybe.message,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const categoryId = (url.searchParams.get('categoryId') ?? '').trim();
  const locationId = url.searchParams.get('locationId') ?? '';

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
            ) AS machine_name
          FROM (
            SELECT to_jsonb(m) AS payload
            FROM machines m
          ) src
        )
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
          COALESCE(m.machine_name, i.category_id) AS "categoryName",
          l.name AS "locationName"
        FROM inventory.items i
        LEFT JOIN machine_rows m ON m.machine_code = i.category_id
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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', errorCode: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = inventoryItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', errorCode: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsed.data;
  const diagnostics: CreateDiagnostics = {
    debugId: randomUUID(),
    sku: payload.sku,
    categoryId: payload.categoryId,
    locationId: payload.locationId,
    hasImageUrl: Boolean(normalizeNullableText(payload.imageUrl)),
    hasImagePath: Boolean(normalizeNullableText(payload.imagePath)),
    quantity: payload.quantity,
  };

  try {
    const categoryExists = await inventoryQuery<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM machines m
          WHERE COALESCE(
            NULLIF(to_jsonb(m)->>'machine_code', ''),
            NULLIF(to_jsonb(m)->>'machineid', ''),
            NULLIF(to_jsonb(m)->>'machine_id', '')
          ) = $1
        ) AS exists
      `,
      [payload.categoryId],
    );

    if (!categoryExists.rows[0]?.exists) {
      return NextResponse.json(
        {
          error: 'INVALID_CATEGORY',
          errorCode: 'INVALID_CATEGORY',
          debugId: diagnostics.debugId,
        },
        { status: 400 },
      );
    }

    const locationExists = await inventoryQuery<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM inventory.locations
          WHERE id = $1::uuid
            AND is_active = TRUE
        ) AS exists
      `,
      [payload.locationId],
    );

    if (!locationExists.rows[0]?.exists) {
      return NextResponse.json(
        {
          error: 'INVALID_LOCATION',
          errorCode: 'INVALID_LOCATION',
          debugId: diagnostics.debugId,
        },
        { status: 400 },
      );
    }

    const result = await inventoryQuery<{ id: string }>(
      `
        INSERT INTO inventory.items (
          sku,
          name,
          description,
          category_id,
          location_id,
          quantity,
          unit,
          image_url,
          image_path,
          is_active
        ) VALUES (
          $1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10
        )
        RETURNING id::text AS id
      `,
      [
        payload.sku,
        payload.name,
        normalizeNullableText(payload.note ?? payload.description),
        payload.categoryId,
        payload.locationId,
        payload.quantity,
        normalizeNullableText(payload.unit),
        normalizeNullableText(payload.imageUrl),
        normalizeNullableText(payload.imagePath),
        payload.status !== 'inactive',
      ],
    );

    return NextResponse.json({ id: result.rows[0]?.id ?? null }, { status: 201 });
  } catch (error) {
    const dbError = toSafeDbError(error);

    console.error('[inventory/items] create failed', {
      ...diagnostics,
      code: dbError.code,
      table: dbError.table,
      column: dbError.column,
      constraint: dbError.constraint,
    });

    if (dbError.code === '23505') {
      return NextResponse.json(
        {
          error: 'SKU_ALREADY_EXISTS',
          errorCode: 'SKU_ALREADY_EXISTS',
          debugId: diagnostics.debugId,
        },
        { status: 409 },
      );
    }

    if (dbError.code === '23502') {
      return NextResponse.json(
        {
          error: 'SCHEMA_CONSTRAINT_MISMATCH',
          errorCode: 'SCHEMA_CONSTRAINT_MISMATCH',
          debugId: diagnostics.debugId,
        },
        { status: 500 },
      );
    }

    if (dbError.code === '23503') {
      return NextResponse.json(
        {
          error: 'REFERENCE_NOT_FOUND',
          errorCode: 'REFERENCE_NOT_FOUND',
          debugId: diagnostics.debugId,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: 'DB_WRITE_FAILED',
        errorCode: 'DB_WRITE_FAILED',
        debugId: diagnostics.debugId,
      },
      { status: 500 },
    );
  }
}
