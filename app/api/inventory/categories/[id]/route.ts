import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';
import { inventoryMasterUpdateSchema, normalizeNullableText } from '@/lib/inventory/schemas';

export const runtime = 'nodejs';

const paramsSchema = z.object({ id: z.string().uuid() });

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

  const parsedBody = inventoryMasterUpdateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsedBody.data;
  const updates: string[] = [];
  const params: unknown[] = [];
  const setField = (column: string, value: unknown) => {
    params.push(value);
    updates.push(`${column} = $${params.length}`);
  };

  if (payload.code !== undefined) setField('code', payload.code);
  if (payload.name !== undefined) setField('name', payload.name);
  if (payload.description !== undefined) setField('description', normalizeNullableText(payload.description));
  if (payload.sortOrder !== undefined) setField('sort_order', payload.sortOrder);
  if (payload.isActive !== undefined) setField('is_active', payload.isActive);

  if (updates.length === 0) {
    return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });
  }

  params.push(parsedParams.data.id);

  try {
    const result = await inventoryQuery<{ id: string }>(
      `
      UPDATE inventory.categories
      SET ${updates.join(', ')}, updated_at = NOW()
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
