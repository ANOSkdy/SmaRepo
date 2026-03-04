import "server-only";
import { query } from "@/lib/db";

export type MachineRow = {
  id: string;
  name: string;
  active: boolean;
  // どちらの列名でも動くように optional にしておく
  machine_code?: number | null;
  machineid?: number | null;
};

function normalizeMachineCode(input: string | null | undefined): number | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function isMissingColumnError(err: unknown, columnName: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(`column "${columnName}" does not exist`);
}

/**
 * machines の外部コード（URL machineId 相当）で active のレコードを取得
 * - 優先: machine_code
 * - fallback: machineid
 */
export async function findActiveMachineByCode(codeStr: string): Promise<MachineRow | null> {
  const code = normalizeMachineCode(codeStr);
  if (code === null) return null;

  const sqlMachineCode = `
    select id::text as id, name, active, machine_code
    from machines
    where active = true and machine_code = $1
    limit 1
  `;
  const sqlMachineId = `
    select id::text as id, name, active, machineid
    from machines
    where active = true and machineid = $1
    limit 1
  `;

  try {
    const res = await query(sqlMachineCode, [code]);
    return (res?.rows?.[0] as MachineRow | undefined) ?? null;
  } catch (e) {
    // schema が machine_code ではなく machineid の可能性に備える
    if (!isMissingColumnError(e, "machine_code")) throw e;
  }

  const res2 = await query(sqlMachineId, [code]);
  return (res2?.rows?.[0] as MachineRow | undefined) ?? null;
}

/**
 * fallback 用: active な machines の先頭を取得
 */
export async function getFirstActiveMachine(): Promise<MachineRow | null> {
  const sqlMachineCode = `
    select id::text as id, name, active, machine_code
    from machines
    where active = true
    order by machine_code asc nulls last, name asc
    limit 1
  `;
  const sqlMachineId = `
    select id::text as id, name, active, machineid
    from machines
    where active = true
    order by machineid asc nulls last, name asc
    limit 1
  `;

  try {
    const res = await query(sqlMachineCode, []);
    const row = (res?.rows?.[0] as MachineRow | undefined) ?? null;
    return row;
  } catch (e) {
    if (!isMissingColumnError(e, "machine_code")) throw e;
  }

  const res2 = await query(sqlMachineId, []);
  return (res2?.rows?.[0] as MachineRow | undefined) ?? null;
}

/**
 * URL に戻すための “外部コード文字列” を取得
 */
export function getMachineCodeString(row: MachineRow): string | null {
  const n = row.machine_code ?? row.machineid ?? null;
  if (typeof n === "number" && Number.isFinite(n)) return String(n);
  return null;
}
