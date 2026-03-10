import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { isUniqueViolation } from '@/lib/master/errors';
import { masterIdSchema, masterUserUpdateSchema } from '@/lib/master/schemas';
import type { MasterUser } from '@/types/master';

export const runtime = 'nodejs';

type UserRow = MasterUser;

const userSelectSql = `
  u.id::text AS id,
  u.username,
  u.name,
  u.phone,
  u.email,
  u.role,
  u.active,
  u.exclude_break_deduction AS "excludeBreakDeduction",
  u.created_at::text AS "createdAt",
  u.updated_at::text AS "updatedAt"
`;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  const routeParams = await context.params;
  const parsedParams = masterIdSchema.safeParse(routeParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsedBody = masterUserUpdateSchema.safeParse(body);
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

  if (payload.username !== undefined) setField('username', payload.username);
  if (payload.name !== undefined) setField('name', payload.name);
  if (payload.phone !== undefined) setField('phone', payload.phone);
  if (payload.email !== undefined) setField('email', payload.email);
  if (payload.role !== undefined) setField('role', payload.role);
  if (payload.active !== undefined) setField('active', payload.active);
  if (payload.excludeBreakDeduction !== undefined) setField('exclude_break_deduction', payload.excludeBreakDeduction);

  if (updates.length === 0) {
    return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });
  }

  params.push(parsedParams.data.id);

  try {
    const result = await query<UserRow>(
      `
        UPDATE public.users u
        SET
          ${updates.join(', ')},
          updated_at = NOW()
        WHERE u.id = $${params.length}::uuid
        RETURNING
          ${userSelectSql}
      `,
      params,
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error, 'users_username_key')) {
      return NextResponse.json({ error: 'USERNAME_EXISTS' }, { status: 409 });
    }
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
