import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { isUniqueViolation } from '@/lib/master/errors';
import { masterIdSchema, masterMachineUpdateSchema } from '@/lib/master/schemas';
import type { MasterMachine } from '@/types/master';

export const runtime = 'nodejs';

type MachineRow = MasterMachine;

type DbError = {
  code?: string;
  constraint?: string;
  message?: string;
};

const machineSelectSql = `
  id::text AS id,
  machine_code AS "machineCode",
  name,
  active,
  rate,
  rate_unit AS "rateUnit",
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"
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

  const parsedBody = masterMachineUpdateSchema.safeParse(body);
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

  if (payload.name !== undefined) setField('name', payload.name);
  if (payload.machineCode !== undefined) setField('machine_code', payload.machineCode);
  if (payload.active !== undefined) setField('active', payload.active);
  if (payload.rate !== undefined) setField('rate', payload.rate);
  if (payload.rateUnit !== undefined) setField('rate_unit', payload.rateUnit);

  if (updates.length === 0) {
    return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });
  }

  params.push(parsedParams.data.id);

  try {
    const result = await query<MachineRow>(
      `
        UPDATE public.machines
        SET
          ${updates.join(', ')},
          updated_at = NOW()
        WHERE id = $${params.length}::uuid
        RETURNING
          ${machineSelectSql}
      `,
      params,
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error, 'machines_machine_code_key')) {
      return NextResponse.json({ error: 'MACHINE_CODE_EXISTS' }, { status: 409 });
    }

    console.error('[master/machines] update failed', toSafeDbError(error));
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  const routeParams = await context.params;
  const parsedParams = masterIdSchema.safeParse(routeParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  try {
    const result = await query<{ id: string }>(
      `
        DELETE FROM public.machines
        WHERE id = $1::uuid
        RETURNING id::text AS id
      `,
      [parsedParams.data.id],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[master/machines] delete failed', toSafeDbError(error));
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
