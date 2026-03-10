import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { isUniqueViolation } from '@/lib/master/errors';
import { masterWorkTypeCreateSchema } from '@/lib/master/schemas';
import type { MasterWorkType } from '@/types/master';

export const runtime = 'nodejs';

type WorkTypeRow = MasterWorkType;

const workTypeSelectColumns = `
  w.id::text AS id,
  w.work_code AS "workCode",
  w.name,
  w.sort_order AS "sortOrder",
  w.active,
  w.category,
  w.created_at::text AS "createdAt",
  w.updated_at::text AS "updatedAt"
`;

const workTypeReturningColumns = `
  id::text AS id,
  work_code AS "workCode",
  name,
  sort_order AS "sortOrder",
  active,
  category,
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"
`;

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await query<WorkTypeRow>(
      `
        SELECT
          ${workTypeSelectColumns}
        FROM public.work_types w
        ORDER BY w.sort_order ASC, w.name ASC
      `,
      [],
    );

    return NextResponse.json(result.rows as MasterWorkType[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = masterWorkTypeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    const result = await query<WorkTypeRow>(
      `
        INSERT INTO public.work_types (
          work_code,
          name,
          sort_order,
          active,
          category
        ) VALUES (
          $1, $2, $3, $4, $5
        )
        RETURNING
          ${workTypeReturningColumns}
      `,
      [payload.workCode, payload.name, payload.sortOrder, payload.active, payload.category],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'work_types_work_code_key')) {
      return NextResponse.json({ error: 'WORK_CODE_EXISTS' }, { status: 409 });
    }
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
