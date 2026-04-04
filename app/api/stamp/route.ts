export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { getSql } from '@/lib/db/neon';
import { handleSessionAfterLogInsertOrThrow } from '@/lib/services/sessions';
import { resolveNearestActiveSiteDecision } from '@/lib/stamp/gpsNearest';
import { resolveWorkTypeId } from '@/lib/stamp/resolveWorkTypeId';

type Sql = ReturnType<typeof getSql>;
type AuthSessionLike =
  | {
      user?: {
        id?: unknown;
        email?: unknown;
      };
    }
  | null
  | undefined;
type ColumnRow = { column_name: string };
type IdRow = { id: string };
const Uuid = z.string().uuid();

const BodySchema = z
  .object({
    // type/stampType 揺れ吸収
    type: z.string().optional(),
    stampType: z.string().optional(),
    stamp_type: z.string().optional(),

    // machineId 揺れ吸収（数字でも文字でも受ける）
    machineId: z.coerce.string().optional(),
    machine_id: z.coerce.string().optional(),

    // 任意
    decidedSiteId: z.coerce.string().optional(),
    decided_site_id: z.coerce.string().optional(),
    siteId: z.coerce.string().optional(),
    site_id: z.coerce.string().optional(),

    workTypeId: z.coerce.string().optional(),
    work_type_id: z.coerce.string().optional(),

    // work_description は DB NOT NULL なので未指定なら補完
    workDescription: z.string().optional(),
    work_description: z.string().optional(),

    // 位置情報（logs列に合わせる: lat/lon/accuracy_m）
    lat: z.coerce.number().optional(),
    lon: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    accuracy_m: z.coerce.number().optional(),
    accuracy: z.coerce.number().optional(),

    position_timestamp_ms: z.coerce.number().optional(),
    positionTimestampMs: z.coerce.number().optional(),
    positionTimestamp: z.coerce.number().optional(),

    is_cached_position: z.boolean().optional(),
    isCachedPosition: z.boolean().optional(),

    stampedAt: z.string().datetime().optional(),
  })
  .superRefine((d, ctx) => {
    const rawType = (d.stampType ?? d.stamp_type ?? d.type ?? '').toUpperCase();
    if (rawType !== 'IN' && rawType !== 'OUT') {
      ctx.addIssue({
        code: 'custom',
        message: 'type/stampType must be IN or OUT',
        path: ['type'],
      });
    }

    const rawMachine = (d.machineId ?? d.machine_id ?? '').toString().trim();
    if (!rawMachine) {
      ctx.addIssue({
        code: 'custom',
        message: 'machineId is required',
        path: ['machineId'],
      });
    }
  })
  .transform((d) => {
    const stampType = (
      d.stampType ??
      d.stamp_type ??
      d.type ??
      ''
    ).toUpperCase() as 'IN' | 'OUT';
    const machineRef = (d.machineId ?? d.machine_id ?? '').toString().trim();

    const decidedSiteRef =
      (d.decidedSiteId ?? d.decided_site_id ?? d.siteId ?? d.site_id ?? '')
        .toString()
        .trim() || null;

    const workTypeRef =
      (d.workTypeId ?? d.work_type_id ?? '').toString().trim() || null;

    const workDescRaw = (d.workDescription ?? d.work_description ?? '').trim();
    const workDescription = workDescRaw.length > 0 ? workDescRaw : 'NFC打刻';

    const lat = typeof d.lat === 'number' ? d.lat : null;
    const lon =
      typeof d.lon === 'number'
        ? d.lon
        : typeof d.lng === 'number'
          ? d.lng
          : typeof d.longitude === 'number'
            ? d.longitude
            : null;

    const accuracyM =
      typeof d.accuracy_m === 'number'
        ? d.accuracy_m
        : typeof d.accuracy === 'number'
          ? d.accuracy
          : null;

    const positionTimestampMs =
      typeof d.position_timestamp_ms === 'number'
        ? d.position_timestamp_ms
        : typeof d.positionTimestampMs === 'number'
          ? d.positionTimestampMs
          : typeof d.positionTimestamp === 'number'
            ? d.positionTimestamp
            : null;

    const isCachedPosition =
      d.is_cached_position ?? d.isCachedPosition ?? false;

    return {
      stampType,
      machineRef,
      decidedSiteRef,
      workTypeRef,
      workDescription,
      lat,
      lon,
      accuracyM,
      positionTimestampMs,
      isCachedPosition,
      stampedAt: d.stampedAt ?? null,
    };
  });

function toJstWorkDate(d: Date): string {
  // JST(UTC+9) の YYYY-MM-DD
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

async function resolveUserId(
  sql: Sql,
  session: AuthSessionLike
): Promise<string | null> {
  const raw = session?.user?.id;
  if (typeof raw === 'string' && Uuid.safeParse(raw).success) return raw;

  const email = session?.user?.email;
  if (typeof email !== 'string' || email.length === 0) return null;

  // users テーブルに email 列がある場合のみフォールバック
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
  `;
  const set = new Set((cols as ColumnRow[]).map((r) => r.column_name));

  if (set.has('email')) {
    const rows = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    return (rows as IdRow[])?.[0]?.id ?? null;
  }
  if (set.has('email_address')) {
    const rows =
      await sql`SELECT id FROM users WHERE email_address = ${email} LIMIT 1`;
    return (rows as IdRow[])?.[0]?.id ?? null;
  }

  return null;
}

async function resolveMachineId(
  sql: Sql,
  machineRef: string
): Promise<string | null> {
  // UUIDならそのまま
  if (Uuid.safeParse(machineRef).success) return machineRef;

  // machines テーブルの「番号/コード」っぽい列で解決を試みる（存在する列だけ試す）
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='machines'
  `;
  const set = new Set((cols as ColumnRow[]).map((r) => r.column_name));

  // よくある候補（列が無ければスキップ）
  const candidates: Array<{
    col: string;
    query: (v: string) => Promise<unknown[]>;
  }> = [];

  if (set.has('machine_no')) {
    candidates.push({
      col: 'machine_no',
      query: (v) =>
        sql`SELECT id FROM machines WHERE machine_no::text = ${v} LIMIT 1`,
    });
  }
  if (set.has('machine_number')) {
    candidates.push({
      col: 'machine_number',
      query: (v) =>
        sql`SELECT id FROM machines WHERE machine_number::text = ${v} LIMIT 1`,
    });
  }
  if (set.has('machine_code')) {
    candidates.push({
      col: 'machine_code',
      query: (v) =>
        sql`SELECT id FROM machines WHERE machine_code::text = ${v} LIMIT 1`,
    });
  }
  if (set.has('code')) {
    candidates.push({
      col: 'code',
      query: (v) =>
        sql`SELECT id FROM machines WHERE code::text = ${v} LIMIT 1`,
    });
  }
  if (set.has('nfc_uid')) {
    candidates.push({
      col: 'nfc_uid',
      query: (v) =>
        sql`SELECT id FROM machines WHERE nfc_uid::text = ${v} LIMIT 1`,
    });
  }
  if (set.has('tag_uid')) {
    candidates.push({
      col: 'tag_uid',
      query: (v) =>
        sql`SELECT id FROM machines WHERE tag_uid::text = ${v} LIMIT 1`,
    });
  }

  for (const c of candidates) {
    const rows = (await c.query(machineRef)) as IdRow[];
    if (rows?.[0]?.id) return rows[0].id;
  }

  return null;
}

function toNullableUuid(v: string | null): string | null {
  if (!v) return null;
  return Uuid.safeParse(v).success ? v : null;
}

async function runSessionMaintenanceWithSingleRetry(params: {
  logId: string;
  requestId: string;
  userId: string;
  workDate: string;
}): Promise<void> {
  try {
    await handleSessionAfterLogInsertOrThrow(params.logId, {
      requestId: params.requestId,
    });
  } catch (error1) {
    console.warn({
      level: 'warn',
      event: 'stamp-session-maintenance-retry',
      requestId: params.requestId,
      logId: params.logId,
      userId: params.userId,
      workDate: params.workDate,
      error: error1,
    });
    await handleSessionAfterLogInsertOrThrow(params.logId, {
      requestId: params.requestId,
    });
  }
}

export async function POST(req: Request) {
  const requestId =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2);

  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', requestId },
        { status: 401 }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request',
          issues: parsed.error.flatten(),
          requestId,
        },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const stampedAt = input.stampedAt ? new Date(input.stampedAt) : new Date();
    const workDate = toJstWorkDate(stampedAt);

    const sql = getSql();

    const userId = await resolveUserId(sql, session);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', requestId },
        { status: 401 }
      );
    }

    const machineId = await resolveMachineId(sql, input.machineRef);
    if (!machineId) {
      return NextResponse.json(
        { ok: false, error: 'Invalid machineId', requestId },
        { status: 400 }
      );
    }

    let decidedSiteId = toNullableUuid(input.decidedSiteRef);
    let decidedSiteNameSnapshot: string | null = null;
    let clientNameSnapshot: string | null = null;
    let nearestDistanceM: number | null = null;
    let withinRadius = false;
    const decisionMethod = 'gps_nearest';

    if (input.lat !== null && input.lon !== null) {
      const nearestDecision = await resolveNearestActiveSiteDecision(
        sql,
        input.lat,
        input.lon
      );
      if (nearestDecision.decidedSiteId) {
        decidedSiteId = nearestDecision.decidedSiteId;
        decidedSiteNameSnapshot = nearestDecision.decidedSiteNameSnapshot;
        clientNameSnapshot = nearestDecision.clientNameSnapshot;
        nearestDistanceM = nearestDecision.nearestDistanceM;
        withinRadius = nearestDecision.withinRadius;
      }
    }

    if (decidedSiteId && (!decidedSiteNameSnapshot || !clientNameSnapshot)) {
      const snapshotRows = (await sql`
        SELECT name, client_name
        FROM sites
        WHERE id = ${decidedSiteId}::uuid
        LIMIT 1
      `) as Array<{ name: string | null; client_name: string | null }>;
      const snapshot = snapshotRows[0] ?? null;
      if (snapshot) {
        decidedSiteNameSnapshot = snapshot.name;
        clientNameSnapshot = snapshot.client_name;
      }
    }

    const workTypeId = await resolveWorkTypeId(
      sql,
      input.workTypeRef,
      input.workDescription
    );

    const rows = await sql`
      INSERT INTO logs (
        stamped_at,
        work_date,
        user_id,
        machine_id,
        decided_site_id,
        work_type_id,
        decided_site_name_snapshot,
        client_name_snapshot,
        work_description,
        stamp_type,
        lat,
        lon,
        accuracy_m,
        position_timestamp_ms,
        is_cached_position,
        decision_method,
        nearest_distance_m,
        within_radius
      ) VALUES (
        ${stampedAt.toISOString()},
        ${workDate},
        ${userId},
        ${machineId},
        ${decidedSiteId},
        ${workTypeId},
        ${decidedSiteNameSnapshot},
        ${clientNameSnapshot},
        ${input.workDescription},
        ${input.stampType},
        ${input.lat},
        ${input.lon},
        ${input.accuracyM},
        ${input.positionTimestampMs},
        ${input.isCachedPosition},
        ${decisionMethod},
        ${nearestDistanceM},
        ${withinRadius}
      )
      RETURNING id, stamped_at, work_date, user_id, machine_id, stamp_type, nearest_distance_m, within_radius
    `;

    const insertedLogId = (rows?.[0] as { id?: unknown } | undefined)?.id;
    if (typeof insertedLogId === 'string' && insertedLogId.length > 0) {
      try {
        await runSessionMaintenanceWithSingleRetry({
          logId: insertedLogId,
          requestId,
          userId,
          workDate,
        });
      } catch (sessionError) {
        console.error({
          level: 'error',
          event: 'stamp-session-maintenance-failed',
          requestId,
          logId: insertedLogId,
          userId,
          workDate,
          error: sessionError,
        });
        return NextResponse.json(
          {
            ok: false,
            error: 'Stamp recorded but calendar reflection failed',
            requestId,
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { ok: true, stamp: rows[0], requestId },
      { status: 201 }
    );
  } catch (err) {
    console.error({
      level: 'error',
      event: 'Failed to record stamp',
      requestId,
      err,
    });
    return NextResponse.json(
      { ok: false, error: 'Failed to record stamp', requestId },
      { status: 500 }
    );
  }
}
