import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { isUniqueViolation } from '@/lib/master/errors';
import { masterIdSchema, masterWorkTypeUpdateSchema } from '@/lib/master/schemas';
import type { MasterWorkType } from '@/types/master';

export const runtime = 'nodejs';

type WorkTypeRow = MasterWorkType;

const workTypeSelectSql = `
  w.id::text AS id,
  w.work_code AS "workCode",
  w.name,
  w.sort_order AS "sortOrder",
  w.active,
  w.category,
  w.created_at::text AS "createdAt",
  w.updated_at::text AS "updatedAt"
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

  const parsedBody = masterWorkTypeUpdateSchema.safeParse(body);
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

  if (payload.workCode !== undefined) setField('work_code', payload.workCode);
  if (payload.name !== undefined) setField('name', payload.name);
  if (payload.sortOrder !== undefined) setField('sort_order', payload.sortOrder);
  if (payload.active !== undefined) setField('active', payload.active);
  if (payload.category !== undefined) setField('category', payload.category);

  if (updates.length === 0) {
    return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });
  }

  params.push(parsedParams.data.id);

  try {
    const result = await query<WorkTypeRow>(
      `
        UPDATE public.work_types w
        SET
          ${updates.join(', ')},
          updated_at = NOW()
        WHERE w.id = $${params.length}::uuid
        RETURNING
          ${workTypeSelectSql}
      `,
      params,
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error, 'work_types_work_code_key')) {
      return NextResponse.json({ error: 'WORK_CODE_EXISTS' }, { status: 409 });
    }
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
