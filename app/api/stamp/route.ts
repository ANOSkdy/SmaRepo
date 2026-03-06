export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { getSql } from '@/lib/db/neon';

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
type SiteResolved = {
  siteId: string | null;
  siteName: string | null;
  decisionMethod: 'gps_polygon' | 'gps_nearest' | 'client' | 'none';
};

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

async function getTableColumnSet(
  sql: Sql,
  tableName: string
): Promise<Set<string>> {
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=${tableName}
  `;
  return new Set((cols as ColumnRow[]).map((r) => r.column_name));
}

async function resolveSiteByServer(
  sql: Sql,
  params: {
    inputSiteId: string | null;
    lat: number | null;
    lon: number | null;
  }
): Promise<SiteResolved> {
  const inputSiteId = toNullableUuid(params.inputSiteId);
  const { lat, lon } = params;

  const siteCols = await getTableColumnSet(sql, 'sites');
  if (!siteCols.has('id')) {
    return {
      siteId: inputSiteId,
      siteName: null,
      decisionMethod: inputSiteId ? 'client' : 'none',
    };
  }

  const hasActive = siteCols.has('active');
  const hasName = siteCols.has('name');
  const hasGeom = siteCols.has('geom');
  const hasLatLon = siteCols.has('lat') && siteCols.has('lon');

  if (typeof lat === 'number' && typeof lon === 'number') {
    if (hasGeom) {
      try {
        const polygonRows = await sql`
          SELECT
            id::text as id,
            ${hasName ? sql`name::text` : sql`NULL::text`} as name
          FROM sites
          WHERE (${hasActive ? sql`active = true` : sql`true`})
            AND geom IS NOT NULL
            AND ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
          LIMIT 1
        `;
        const polygonHit =
          (polygonRows as Array<{ id: string; name: string | null }>)[0] ??
          null;
        if (polygonHit?.id) {
          return {
            siteId: polygonHit.id,
            siteName: polygonHit.name,
            decisionMethod: 'gps_polygon',
          };
        }
      } catch {
        // PostGIS未有効環境でも処理継続する
      }
    }

    if (hasLatLon) {
      const nearestRows = await sql`
        SELECT
          id::text as id,
          ${hasName ? sql`name::text` : sql`NULL::text`} as name
        FROM sites
        WHERE (${hasActive ? sql`active = true` : sql`true`})
          AND lat IS NOT NULL
          AND lon IS NOT NULL
        ORDER BY ((lat - ${lat}) * (lat - ${lat}) + (lon - ${lon}) * (lon - ${lon})) ASC
        LIMIT 1
      `;
      const nearest =
        (nearestRows as Array<{ id: string; name: string | null }>)[0] ?? null;
      if (nearest?.id) {
        return {
          siteId: nearest.id,
          siteName: nearest.name,
          decisionMethod: 'gps_nearest',
        };
      }
    }
  }

  if (inputSiteId) {
    const rows = await sql`
      SELECT
        id::text as id,
        ${hasName ? sql`name::text` : sql`NULL::text`} as name
      FROM sites
      WHERE id = ${inputSiteId}::uuid
      LIMIT 1
    `;
    const match =
      (rows as Array<{ id: string; name: string | null }>)[0] ?? null;
    if (match?.id) {
      return {
        siteId: match.id,
        siteName: match.name,
        decisionMethod: 'client',
      };
    }
  }

  return { siteId: null, siteName: null, decisionMethod: 'none' };
}

function buildUniqueKey(params: {
  userId: string;
  stampType: 'IN' | 'OUT';
  stampedAt: Date;
}): string {
  const bucketSec = 30;
  const roundedUnix = Math.floor(
    params.stampedAt.getTime() / (bucketSec * 1000)
  );
  return `${params.userId}:${params.stampType}:${roundedUnix}`;
}

function toNullableUuid(v: string | null): string | null {
  if (!v) return null;
  return Uuid.safeParse(v).success ? v : null;
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

    const siteResolved = await resolveSiteByServer(sql, {
      inputSiteId: input.decidedSiteRef,
      lat: input.lat,
      lon: input.lon,
    });
    const workTypeId = toNullableUuid(input.workTypeRef);
    const logsCols = await getTableColumnSet(sql, 'logs');
    const uniqueKey = logsCols.has('unique_key')
      ? buildUniqueKey({ userId, stampType: input.stampType, stampedAt })
      : null;
    const siteNameSnapshot = logsCols.has('decided_site_name_snapshot')
      ? siteResolved.siteName
      : null;

    if (uniqueKey && siteNameSnapshot !== null) {
      const rows = await sql`
        INSERT INTO logs (
          stamped_at,
          work_date,
          user_id,
          machine_id,
          decided_site_id,
          decided_site_name_snapshot,
          work_type_id,
          work_description,
          stamp_type,
          lat,
          lon,
          accuracy_m,
          position_timestamp_ms,
          is_cached_position,
          unique_key
        ) VALUES (
          ${stampedAt.toISOString()},
          ${workDate},
          ${userId},
          ${machineId},
          ${siteResolved.siteId},
          ${siteNameSnapshot},
          ${workTypeId},
          ${input.workDescription},
          ${input.stampType},
          ${input.lat},
          ${input.lon},
          ${input.accuracyM},
          ${input.positionTimestampMs},
          ${input.isCachedPosition},
          ${uniqueKey}
        )
        ON CONFLICT (unique_key)
        DO UPDATE SET
          accuracy_m = COALESCE(EXCLUDED.accuracy_m, logs.accuracy_m),
          position_timestamp_ms = COALESCE(EXCLUDED.position_timestamp_ms, logs.position_timestamp_ms)
        RETURNING id, stamped_at, work_date, user_id, machine_id, stamp_type
      `;

      return NextResponse.json(
        {
          ok: true,
          stamp: rows[0],
          siteDecision: {
            method: siteResolved.decisionMethod,
            siteId: siteResolved.siteId,
          },
          requestId,
        },
        { status: 201 }
      );
    }

    if (uniqueKey) {
      const rows = await sql`
        INSERT INTO logs (
          stamped_at,
          work_date,
          user_id,
          machine_id,
          decided_site_id,
          work_type_id,
          work_description,
          stamp_type,
          lat,
          lon,
          accuracy_m,
          position_timestamp_ms,
          is_cached_position,
          unique_key
        ) VALUES (
          ${stampedAt.toISOString()},
          ${workDate},
          ${userId},
          ${machineId},
          ${siteResolved.siteId},
          ${workTypeId},
          ${input.workDescription},
          ${input.stampType},
          ${input.lat},
          ${input.lon},
          ${input.accuracyM},
          ${input.positionTimestampMs},
          ${input.isCachedPosition},
          ${uniqueKey}
        )
        ON CONFLICT (unique_key)
        DO UPDATE SET
          accuracy_m = COALESCE(EXCLUDED.accuracy_m, logs.accuracy_m),
          position_timestamp_ms = COALESCE(EXCLUDED.position_timestamp_ms, logs.position_timestamp_ms)
        RETURNING id, stamped_at, work_date, user_id, machine_id, stamp_type
      `;

      return NextResponse.json(
        {
          ok: true,
          stamp: rows[0],
          siteDecision: {
            method: siteResolved.decisionMethod,
            siteId: siteResolved.siteId,
          },
          requestId,
        },
        { status: 201 }
      );
    }

    const rows = await sql`
      INSERT INTO logs (
        stamped_at,
        work_date,
        user_id,
        machine_id,
        decided_site_id,
        work_type_id,
        work_description,
        stamp_type,
        lat,
        lon,
        accuracy_m,
        position_timestamp_ms,
        is_cached_position
      ) VALUES (
        ${stampedAt.toISOString()},
        ${workDate},
        ${userId},
        ${machineId},
        ${siteResolved.siteId},
        ${workTypeId},
        ${input.workDescription},
        ${input.stampType},
        ${input.lat},
        ${input.lon},
        ${input.accuracyM},
        ${input.positionTimestampMs},
        ${input.isCachedPosition}
      )
      RETURNING id, stamped_at, work_date, user_id, machine_id, stamp_type
    `;

    return NextResponse.json(
      {
        ok: true,
        stamp: rows[0],
        siteDecision: {
          method: siteResolved.decisionMethod,
          siteId: siteResolved.siteId,
        },
        requestId,
      },
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
