import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import type { MasterWorkType } from '@/types/master';

export const runtime = 'nodejs';

type WorkTypeRow = MasterWorkType;

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await query<WorkTypeRow>(
      `
        SELECT
          w.id::text AS id,
          w.work_code AS "workCode",
          w.name,
          w.sort_order AS "sortOrder",
          w.active,
          w.category,
          w.created_at::text AS "createdAt",
          w.updated_at::text AS "updatedAt"
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
