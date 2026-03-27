import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import { inventoryItemCreateSchema, normalizeNullableText } from '@/lib/inventory/schemas';
import type { InventoryItemListEntry } from '@/types/inventory';

type DbError = {
  code?: string;
  constraint?: string;
  column?: string;
  table?: string;
  detail?: string;
  message?: string;
};

function toSafeDbError(error: unknown): DbError {
  if (!error || typeof error !== 'object') return {};
  const maybe = error as DbError;
  return {
    code: maybe.code,
    constraint: maybe.constraint,
    column: maybe.column,
    table: maybe.table,
    detail: maybe.detail,
    message: maybe.message,
  };
}



type InventoryCreateMeta = {
  sku: string | null;
  categoryId: string | null;
  locationId: string | null;
  hasImageUrl: boolean;
  hasImagePath: boolean;
  quantity: number | null;
};

function toInventoryCreateMeta(value: unknown): InventoryCreateMeta {
  if (!value || typeof value !== 'object') {
    return {
      sku: null,
      categoryId: null,
      locationId: null,
      hasImageUrl: false,
      hasImagePath: false,
      quantity: null,
    };
  }

  const payload = value as Record<string, unknown>;
  return {
    sku: typeof payload.sku === 'string' ? payload.sku : null,
    categoryId: typeof payload.categoryId === 'string' ? payload.categoryId : null,
    locationId: typeof payload.locationId === 'string' ? payload.locationId : null,
    hasImageUrl: typeof payload.imageUrl === 'string' && payload.imageUrl.trim().length > 0,
    hasImagePath: typeof payload.imagePath === 'string' && payload.imagePath.trim().length > 0,
    quantity: typeof payload.quantity === 'number' ? payload.quantity : null,
  };
}

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
  const debugId = crypto.randomUUID();
  const respond = (body: Record<string, unknown>, status: number) =>
    NextResponse.json(
      {
        ...body,
        debugId,
      },
      {
        status,
        headers: { 'x-debug-id': debugId },
      },
    );

  console.info('[inventory/items] create started', { debugId });

  const session = await auth();
  if (!session?.user) {
    console.info('[inventory/items] create unauthorized', { debugId });
    return respond({ error: 'UNAUTHORIZED', errorCode: 'UNAUTHORIZED' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
    console.info('[inventory/items] body parsed', { debugId, ...toInventoryCreateMeta(body) });
  } catch (error) {
    console.error('[inventory/items] invalid json', { debugId, dbError: toSafeDbError(error) });
    return respond({ error: 'INVALID_JSON', errorCode: 'INVALID_JSON' }, 400);
  }

  const parsed = inventoryItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    console.info('[inventory/items] body validation failed', {
      debugId,
      issues: parsed.error.issues.length,
      ...toInventoryCreateMeta(body),
    });
    return respond({ error: 'INVALID_BODY', errorCode: 'INVALID_BODY' }, 400);
  }

  const payload = parsed.data;
  const meta = toInventoryCreateMeta(payload);
  console.info('[inventory/items] body validated', { debugId, ...meta });

  try {
    const referenceResult = await inventoryQuery<{ category_exists: boolean; location_exists: boolean }>(
      `
        SELECT
          EXISTS (
            SELECT 1
            FROM public.machines m
            WHERE m.machine_code = $1
          ) AS category_exists,
          EXISTS (
            SELECT 1
            FROM inventory.locations l
            WHERE l.id = $2::uuid
              AND l.is_active = TRUE
          ) AS location_exists
      `,
      [payload.categoryId, payload.locationId],
    );

    const references = referenceResult.rows[0];
    console.info('[inventory/items] pre-insert checks result', {
      debugId,
      categoryExists: references?.category_exists ?? false,
      locationExists: references?.location_exists ?? false,
      ...meta,
    });

    if (!references?.category_exists) {
      return respond({ error: 'INVALID_CATEGORY_ID', errorCode: 'INVALID_CATEGORY_ID' }, 400);
    }
    if (!references.location_exists) {
      return respond({ error: 'INVALID_LOCATION_ID', errorCode: 'INVALID_LOCATION_ID' }, 400);
    }

    console.info('[inventory/items] db insert attempt', { debugId, ...meta });

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

    const createdId = result.rows[0]?.id ?? null;
    console.info('[inventory/items] db insert succeeded', { debugId, createdId, ...meta });
    return respond({ id: createdId }, 201);
  } catch (error) {
    const dbError = toSafeDbError(error);
    console.error('[inventory/items] db insert failed', { debugId, ...meta, dbError });

    if (dbError.code === '23505') {
      return respond({ error: 'SKU_ALREADY_EXISTS', errorCode: 'SKU_ALREADY_EXISTS' }, 409);
    }

    if (dbError.code === '23503') {
      if (dbError.constraint === 'items_location_id_fkey') {
        return respond({ error: 'INVALID_LOCATION_ID', errorCode: 'INVALID_LOCATION_ID' }, 409);
      }
      return respond({ error: 'INVALID_REFERENCE', errorCode: 'INVALID_REFERENCE' }, 409);
    }

    if (dbError.code === '22P02') {
      return respond({ error: 'CATEGORY_SCHEMA_MISMATCH', errorCode: 'CATEGORY_SCHEMA_MISMATCH' }, 409);
    }

    if (dbError.code === '23502') {
      return respond({ error: 'DB_SCHEMA_CONSTRAINT_VIOLATION', errorCode: 'DB_SCHEMA_CONSTRAINT_VIOLATION' }, 500);
    }

    return respond({ error: 'DB_WRITE_FAILED', errorCode: 'DB_WRITE_FAILED' }, 500);
  }
}

