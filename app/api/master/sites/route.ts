import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { masterSiteCreateSchema } from '@/lib/master/schemas';
import type { MasterSite } from '@/types/master';

export const runtime = 'nodejs';

type SiteRow = MasterSite;

const siteReturningSql = `
  id::text AS id,
  name,
  client_name AS "clientName",
  active,
  radius_m AS "radiusM",
  priority,
  ST_X(center_geog::geometry) AS longitude,
  ST_Y(center_geog::geometry) AS latitude,
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"
`;

const siteSelectSql = `
  s.id::text AS id,
  s.name,
  s.client_name AS "clientName",
  s.active,
  s.radius_m AS "radiusM",
  s.priority,
  ST_X(s.center_geog::geometry) AS longitude,
  ST_Y(s.center_geog::geometry) AS latitude,
  s.created_at::text AS "createdAt",
  s.updated_at::text AS "updatedAt"
`;

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await query<SiteRow>(
      `
        SELECT
          ${siteSelectSql}
        FROM public.sites s
        ORDER BY s.priority DESC, s.name ASC
      `,
      [],
    );

    return NextResponse.json(result.rows as MasterSite[]);
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

  const parsed = masterSiteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    const result = await query<SiteRow>(
      `
        INSERT INTO public.sites (
          name,
          client_name,
          center_geog,
          radius_m,
          priority,
          active
        ) VALUES (
          $1,
          $2,
          ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
          $5,
          $6,
          $7
        )
        RETURNING
          ${siteReturningSql}
      `,
      [payload.name, payload.clientName || null, payload.longitude, payload.latitude, payload.radiusM, payload.priority, payload.active],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
