import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { masterMachineCreateSchema } from '@/lib/master/schemas';
import type { MasterMachine } from '@/types/master';

export const runtime = 'nodejs';

type MachineRow = MasterMachine;

type PgError = { code?: string; constraint?: string };
type MachineCreatePayload = { name: string; machineCode: string; active: boolean };

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

async function listMachinesWithColumn(codeColumn: 'machine_code' | 'machineid') {
  return query<MachineRow>(
    `
      SELECT
        ${machineSelectSql(codeColumn)}
      FROM public.machines m
      ORDER BY m.${codeColumn} ASC, m.name ASC
    `,
    [],
  );
}

async function resolveMachineCodeColumns() {
  const result = await query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'machines'
        AND column_name IN ('machine_code', 'machineid')
      ORDER BY
        CASE column_name
          WHEN 'machine_code' THEN 1
          WHEN 'machineid' THEN 2
          ELSE 99
        END
    `,
    [],
  );

  return result.rows.map((row) => row.column_name).filter((name): name is 'machine_code' | 'machineid' => name === 'machine_code' || name === 'machineid');
}

async function createMachineWithAvailableColumns(payload: MachineCreatePayload) {
  const codeColumns = await resolveMachineCodeColumns();
  if (codeColumns.length === 0) {
    throw new Error('MACHINE_CODE_COLUMN_MISSING');
  }

  const insertColumns = ['name', ...codeColumns, 'active'];
  const params: unknown[] = [payload.name, ...codeColumns.map(() => payload.machineCode), payload.active];
  const placeholders = params.map((_, index) => `$${index + 1}`);
  const primaryCodeColumn = codeColumns[0] ?? 'machine_code';

  return query<MachineRow>(
    `
      INSERT INTO public.machines (
        ${insertColumns.join(', ')}
      ) VALUES (
        ${placeholders.join(', ')}
      )
      RETURNING
        ${machineSelectSql(primaryCodeColumn)}
    `,
    params,
  );
}

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await listMachinesWithColumn('machine_code');
    return NextResponse.json(result.rows as MasterMachine[]);
  } catch (error) {
    if (isMissingColumnError(error, 'machine_code')) {
      try {
        const fallbackResult = await listMachinesWithColumn('machineid');
        return NextResponse.json(fallbackResult.rows as MasterMachine[]);
      } catch {
        return NextResponse.json({ error: 'DB_QUERY_FAILED' }, { status: 500 });
      }
    }

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
    const result = await createMachineWithAvailableColumns(payload);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    const maybeError = error as PgError & { message?: string };
    console.error('[master/machines:POST] DB write failed', {
      code: maybeError?.code ?? null,
      constraint: maybeError?.constraint ?? null,
      message: maybeError?.message ?? 'unknown',
    });

    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'MACHINE_CODE_EXISTS' }, { status: 409 });
    }

    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
