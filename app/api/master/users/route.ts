import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import type { MasterUser } from '@/types/master';

export const runtime = 'nodejs';

type UserRow = MasterUser;

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await query<UserRow>(
      `
        SELECT
          u.id::text AS id,
          u.user_code AS "userCode",
          u.username,
          u.name,
          u.phone,
          u.email,
          u.role,
          u.active,
          u.exclude_break_deduction AS "excludeBreakDeduction",
          u.created_at::text AS "createdAt",
          u.updated_at::text AS "updatedAt"
        FROM public.users u
        ORDER BY u.user_code ASC NULLS LAST, u.name ASC
      `,
      [],
    );

    return NextResponse.json(result.rows as MasterUser[]);
  } catch {
    return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
  }
}
