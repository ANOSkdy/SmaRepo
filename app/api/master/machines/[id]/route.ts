import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { masterIdSchema, masterMachineUpdateSchema } from '@/lib/master/schemas';
import type { MasterMachine } from '@/types/master';

export const runtime = 'nodejs';

type MachineRow = MasterMachine;

type MachineRefRow = {
  id: string;
  machineCode: string;
};

type CountRow = {
  count: string;
};

type PgError = { code?: string };

const machineSelectSql = (codeColumn: 'machine_code' | 'machineid') => `
  m.id::text AS id,
  m.name,
  m.${codeColumn} AS "machineCode",
  m.active,
  m.created_at::text AS "createdAt",
  m.updated_at::text AS "updatedAt"
`;

function isMissingColumnError(error: unknown, columnName: string) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(`column m.${columnName} does not exist`) || message.includes(`column "${columnName}" does not exist`);
}

function isUniqueViolation(error: unknown) {
  const maybeError = error as PgError;
  return maybeError?.code === '23505';
}

function isForeignKeyViolation(error: unknown) {
  const maybeError = error as PgError;
  return maybeError?.code === '23503';
}

async function updateMachineWithColumn(codeColumn: 'machine_code' | 'machineid', id: string, payload: { name?: string; machineCode?: string; active?: boolean }) {
  const updates: string[] = [];
  const params: unknown[] = [];

  const setField = (sql: string, value: unknown) => {
    params.push(value);
    updates.push(`${sql} = $${params.length}`);
  };

  if (payload.name !== undefined) setField('name', payload.name);
  if (payload.machineCode !== undefined) setField(codeColumn, payload.machineCode);
  if (payload.active !== undefined) setField('active', payload.active);

  if (!updates.length) {
    return null;
  }

  params.push(id);

  return query<MachineRow>(
    `
      UPDATE public.machines m
      SET
        ${updates.join(', ')},
        updated_at = NOW()
      WHERE m.id = $${params.length}::uuid
      RETURNING
        ${machineSelectSql(codeColumn)}
    `,
    params,
  );
}

async function getMachineRefWithColumn(codeColumn: 'machine_code' | 'machineid', id: string) {
  return query<MachineRefRow>(
    `
      SELECT
        m.id::text AS id,
        m.${codeColumn} AS "machineCode"
      FROM public.machines m
      WHERE m.id = $1::uuid
      LIMIT 1
    `,
    [id],
  );
}

async function countInventoryReferences(machineCode: string) {
  return query<CountRow>(
    `
      SELECT
        CASE
          WHEN to_regclass('inventory.items') IS NULL THEN '0'
          ELSE (
            SELECT COUNT(*)::text
            FROM inventory.items i
            WHERE i.category_id = $1::text
          )
        END AS count
    `,
    [machineCode],
  );
}

async function deleteMachineById(id: string) {
  return query<{ id: string }>(
    `
      DELETE FROM public.machines m
      WHERE m.id = $1::uuid
      RETURNING m.id::text AS id
    `,
    [id],
  );
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

  try {
    const result = await updateMachineWithColumn('machine_code', parsedParams.data.id, payload);
    if (!result) return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (isMissingColumnError(error, 'machine_code')) {
      try {
        const fallbackResult = await updateMachineWithColumn('machineid', parsedParams.data.id, payload);
        if (!fallbackResult) return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });

        if (!fallbackResult.rows[0]) {
          return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
        }

        return NextResponse.json(fallbackResult.rows[0]);
      } catch (fallbackError) {
        if (isUniqueViolation(fallbackError)) {
          return NextResponse.json({ error: 'MACHINE_CODE_EXISTS' }, { status: 409 });
        }

        return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
      }
    }

    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'MACHINE_CODE_EXISTS' }, { status: 409 });
    }

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

  const { id } = parsedParams.data;

  try {
    const refResult = await getMachineRefWithColumn('machine_code', id);
    const machine = refResult.rows[0];

    if (!machine) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    const refCountResult = await countInventoryReferences(machine.machineCode);
    const refCount = Number.parseInt(refCountResult.rows[0]?.count ?? '0', 10);
    if (Number.isFinite(refCount) && refCount > 0) {
      return NextResponse.json({ error: 'MACHINE_IN_USE' }, { status: 409 });
    }

    const deleteResult = await deleteMachineById(id);
    if (!deleteResult.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isMissingColumnError(error, 'machine_code')) {
      try {
        const fallbackRefResult = await getMachineRefWithColumn('machineid', id);
        const fallbackMachine = fallbackRefResult.rows[0];
        if (!fallbackMachine) {
          return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
        }

        const fallbackRefCountResult = await countInventoryReferences(fallbackMachine.machineCode);
        const fallbackRefCount = Number.parseInt(fallbackRefCountResult.rows[0]?.count ?? '0', 10);
        if (Number.isFinite(fallbackRefCount) && fallbackRefCount > 0) {
          return NextResponse.json({ error: 'MACHINE_IN_USE' }, { status: 409 });
        }

        const fallbackDeleteResult = await deleteMachineById(id);
        if (!fallbackDeleteResult.rows[0]) {
          return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
        }

        return NextResponse.json({ ok: true });
      } catch (fallbackError) {
        if (isForeignKeyViolation(fallbackError)) {
          return NextResponse.json({ error: 'MACHINE_IN_USE' }, { status: 409 });
        }

        return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
      }
    }

    if (isForeignKeyViolation(error)) {
      return NextResponse.json({ error: 'MACHINE_IN_USE' }, { status: 409 });
    }

    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
