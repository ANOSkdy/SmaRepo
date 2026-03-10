import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { isUniqueViolation } from '@/lib/master/errors';
import { masterUserCreateSchema } from '@/lib/master/schemas';
import type { MasterUser } from '@/types/master';

export const runtime = 'nodejs';

type UserRow = MasterUser;

const userSelectColumns = `
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
`;

const userReturningColumns = `
  id::text AS id,
  user_code AS "userCode",
  username,
  name,
  phone,
  email,
  role,
  active,
  exclude_break_deduction AS "excludeBreakDeduction",
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"
`;

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await query<UserRow>(
      `
        SELECT
          ${userSelectColumns}
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

  const parsed = masterUserCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const result = await query<UserRow>(
      `
        INSERT INTO public.users (
          user_code,
          username,
          name,
          phone,
          email,
          password_hash,
          role,
          active,
          exclude_break_deduction
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        RETURNING
          ${userReturningColumns}
      `,
      [
        payload.userCode,
        payload.username,
        payload.name,
        payload.phone,
        payload.email,
        passwordHash,
        payload.role,
        payload.active,
        payload.excludeBreakDeduction,
      ],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'users_user_code_key')) {
      return NextResponse.json({ error: 'USER_CODE_EXISTS' }, { status: 409 });
    }
    if (isUniqueViolation(error, 'users_username_key')) {
      return NextResponse.json({ error: 'USERNAME_EXISTS' }, { status: 409 });
    }
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
