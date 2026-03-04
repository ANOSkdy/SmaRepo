import "server-only";
import { query } from "@/lib/db";

export type LogRow = {
  id: string;
  stamped_at: string; // timestamptz
  work_date: string;  // date
  user_id: string;
  machine_id: string;
  decided_site_name_snapshot: string | null;
  client_name_snapshot: string | null;
  work_description: string | null;
  stamp_type: string; // 'IN' | 'OUT' etc
  auto_generated: boolean | null;
};

export async function getLogsForUserOnWorkDate(userId: string, workDate: string): Promise<LogRow[]> {
  const sql = `
    select
      id::text as id,
      stamped_at::text as stamped_at,
      work_date::text as work_date,
      user_id::text as user_id,
      machine_id::text as machine_id,
      decided_site_name_snapshot,
      client_name_snapshot,
      work_description,
      stamp_type,
      auto_generated
    from logs
    where user_id = $1::uuid
      and work_date = $2::date
    order by stamped_at asc
  `;
  const res = await query(sql, [userId, workDate]);
  return (res?.rows as LogRow[]) ?? [];
}

export async function getLatestLogForUserOnWorkDate(
  userId: string,
  workDate: string
): Promise<LogRow | null> {
  const sql = `
    select
      id::text as id,
      stamped_at::text as stamped_at,
      work_date::text as work_date,
      user_id::text as user_id,
      machine_id::text as machine_id,
      decided_site_name_snapshot,
      client_name_snapshot,
      work_description,
      stamp_type,
      auto_generated
    from logs
    where user_id = $1::uuid
      and work_date = $2::date
    order by stamped_at desc
    limit 1
  `;
  const res = await query(sql, [userId, workDate]);
  return ((res?.rows?.[0] as LogRow | undefined) ?? null);
}

export async function getLogsForUserFiltered(params: {
  userId: string;
  fromDate?: string; // YYYY-MM-DD
  toDateExclusive?: string; // YYYY-MM-DD
  siteName?: string | null;
}): Promise<LogRow[]> {
  const values: unknown[] = [params.userId];
  let idx = values.length;

  const where: string[] = [`user_id = $1::uuid`];

  if (params.fromDate) {
    values.push(params.fromDate);
    idx = values.length;
    where.push(`work_date >= $${idx}::date`);
  }
  if (params.toDateExclusive) {
    values.push(params.toDateExclusive);
    idx = values.length;
    where.push(`work_date < $${idx}::date`);
  }
  if (params.siteName && params.siteName.trim().length > 0) {
    values.push(params.siteName.trim());
    idx = values.length;
    where.push(`decided_site_name_snapshot = $${idx}`);
  }

  const sql = `
    select
      id::text as id,
      stamped_at::text as stamped_at,
      work_date::text as work_date,
      user_id::text as user_id,
      machine_id::text as machine_id,
      decided_site_name_snapshot,
      client_name_snapshot,
      work_description,
      stamp_type,
      auto_generated
    from logs
    where ${where.join(" and ")}
    order by stamped_at asc
  `;

  const res = await query(sql, values);
  return (res?.rows as LogRow[]) ?? [];
}
