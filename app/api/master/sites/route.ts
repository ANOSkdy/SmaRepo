import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import type { MasterSite } from '@/types/master';

export const runtime = 'nodejs';

type SiteRow = MasterSite;

export async function GET() {
  const adminSession = await getAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json({ error: adminSession.reason }, { status: adminSession.reason === 'UNAUTHORIZED' ? 401 : 403 });
  }

  try {
    const result = await query<SiteRow>(
      `
        SELECT
          s.id::text AS id,
          s.site_code AS "siteCode",
          s.name,
          s.client_name AS "clientName",
          s.active,
          s.radius_m AS "radiusM",
          s.priority,
          ST_X(s.center_geog::geometry) AS longitude,
          ST_Y(s.center_geog::geometry) AS latitude,
          s.created_at::text AS "createdAt",
          s.updated_at::text AS "updatedAt"
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
