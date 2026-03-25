import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { inventoryQuery } from '@/lib/inventory/db';

export const runtime = 'nodejs';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  amount: z.coerce.number().int().min(1).max(9999).default(1),
});
const updaterUserIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const updaterUserId = updaterUserIdSchema.safeParse(session.user.id);
  if (!updaterUserId.success) {
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

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    const result = await inventoryQuery<{ id: string; quantity: number }>(
      `
        UPDATE inventory.items
        SET quantity = quantity + $2, updated_at = NOW(), updated_by_user_id = $3::uuid
        WHERE id = $1::uuid AND is_active = TRUE
        RETURNING id::text AS id, quantity
      `,
      [parsedParams.data.id, parsedBody.data.amount, updaterUserId.data]
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
