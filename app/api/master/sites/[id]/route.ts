import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/master/auth';
import { isUniqueViolation } from '@/lib/master/errors';
import { masterIdSchema, masterSiteUpdateSchema } from '@/lib/master/schemas';
import type { MasterSite } from '@/types/master';

export const runtime = 'nodejs';

type SiteRow = MasterSite;

const siteReturningColumns = `
  id::text AS id,
  site_code AS "siteCode",
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

  const parsedBody = masterSiteUpdateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = parsedBody.data;

  if ((payload.longitude !== undefined && payload.latitude === undefined) || (payload.longitude === undefined && payload.latitude !== undefined)) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const updates: string[] = [];
  const params: unknown[] = [];

  const setField = (sql: string, value: unknown) => {
    params.push(value);
    updates.push(`${sql} = $${params.length}`);
  };

  if (payload.siteCode !== undefined) setField('site_code', payload.siteCode);
  if (payload.name !== undefined) setField('name', payload.name);
  if (payload.clientName !== undefined) setField('client_name', payload.clientName || null);
  if (payload.radiusM !== undefined) setField('radius_m', payload.radiusM);
  if (payload.priority !== undefined) setField('priority', payload.priority);
  if (payload.active !== undefined) setField('active', payload.active);
  if (payload.longitude !== undefined && payload.latitude !== undefined) {
    params.push(payload.longitude);
    params.push(payload.latitude);
    updates.push(`center_geog = ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)::geography`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 });
  }

  params.push(parsedParams.data.id);

  try {
    const result = await query<SiteRow>(
      `
        UPDATE public.sites s
        SET
          ${updates.join(', ')},
          updated_at = NOW()
        WHERE s.id = $${params.length}::uuid
        RETURNING
          ${siteReturningColumns}
      `,
      params,
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error, 'sites_site_code_key')) {
      return NextResponse.json({ error: 'SITE_CODE_EXISTS' }, { status: 409 });
    }
    return NextResponse.json({ error: 'DB_WRITE_FAILED' }, { status: 500 });
  }
}
