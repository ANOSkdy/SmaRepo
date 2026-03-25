import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { isUniqueViolation } from '@/lib/master/errors';
import { masterMachineCreateSchema } from '@/lib/master/schemas';
import type { MasterMachine } from '@/types/master';

export const runtime = 'nodejs';

type MachineRow = MasterMachine;

type DbError = {
  code?: string;
  constraint?: string;
  message?: string;
};

const machineSelectSql = `
  m.id::text AS id,
  m.machine_code AS "machineCode",
  m.name,
  m.active,
  m.rate,
  m.rate_unit AS "rateUnit",
  m.created_at::text AS "createdAt",
  m.updated_at::text AS "updatedAt"
`;

function toSafeDbError(error: unknown): DbError {
  if (!error || typeof error !== 'object') return {};
  const maybe = error as DbError;
  return {
    code: maybe.code,
    constraint: maybe.constraint,
    message: maybe.message,
  };
}

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await query<MachineRow>(
      `
        SELECT
          ${machineSelectSql}
        FROM public.machines m
        ORDER BY m.machine_code ASC, m.name ASC
      `,
      [],
    );

    return NextResponse.json(result.rows as MasterMachine[]);
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

  const parsed = masterMachineCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    const result = await query<MachineRow>(
      `
        INSERT INTO public.machines (
          machine_code,
          name,
          active,
          rate,
          rate_unit
        ) VALUES (
          $1, $2, $3, $4, $5
        )
        RETURNING
          id::text AS id,
          machine_code AS "machineCode",
          name,
          active,
          rate,
          rate_unit AS "rateUnit",
          created_at::text AS "createdAt",
          updated_at::text AS "updatedAt"
      `,
      [payload.machineCode, payload.name, payload.active, payload.rate, payload.rateUnit],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'machines_machine_code_key')) {
      return NextResponse.json({ error: 'MACHINE_CODE_EXISTS' }, { status: 409 });
    }

    console.error('[master/machines] create failed', toSafeDbError(error));
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
