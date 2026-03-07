export type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

type NearestSiteRow = {
  id: string;
  name: string | null;
  client_name: string | null;
  radius_m: number | null;
  distance_m: number;
};

type ActiveSiteFallbackRow = {
  id: string;
  name: string | null;
  client_name: string | null;
};

export function computeWithinRadius(
  nearestDistanceM: number | null,
  radiusM: number | null
): boolean {
  // radius_m は採否条件ではなく、最寄り拠点判定の信頼度しきい値として扱う。
  if (nearestDistanceM === null || radiusM === null) return false;
  return nearestDistanceM <= radiusM;
}

export async function resolveNearestActiveSiteDecision(
  sql: SqlTag,
  lat: number,
  lon: number
): Promise<{
  decidedSiteId: string | null;
  decidedSiteNameSnapshot: string | null;
  clientNameSnapshot: string | null;
  nearestDistanceM: number | null;
  withinRadius: boolean;
}> {
  const nearestRows = (await sql`
    SELECT
      id,
      name,
      client_name,
      radius_m,
      ST_Distance(
        center_geog,
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
      )::float8 AS distance_m
    FROM sites
    WHERE active = true
      AND center_geog IS NOT NULL
    ORDER BY ST_Distance(
      center_geog,
      ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
    ) ASC
    LIMIT 1
  `) as NearestSiteRow[];

  const nearest = nearestRows[0] ?? null;
  if (nearest) {
    const nearestDistanceM = Number.isFinite(nearest.distance_m)
      ? nearest.distance_m
      : null;
    return {
      decidedSiteId: nearest.id,
      decidedSiteNameSnapshot: nearest.name,
      clientNameSnapshot: nearest.client_name,
      nearestDistanceM,
      withinRadius: computeWithinRadius(nearestDistanceM, nearest.radius_m),
    };
  }

  // center_geog 未整備でも active site があれば未設定(null)を避ける。
  const fallbackRows = (await sql`
    SELECT id, name, client_name
    FROM sites
    WHERE active = true
    ORDER BY priority DESC NULLS LAST, created_at ASC
    LIMIT 1
  `) as ActiveSiteFallbackRow[];
  const fallback = fallbackRows[0] ?? null;

  if (!fallback) {
    return {
      decidedSiteId: null,
      decidedSiteNameSnapshot: null,
      clientNameSnapshot: null,
      nearestDistanceM: null,
      withinRadius: false,
    };
  }

  return {
    decidedSiteId: fallback.id,
    decidedSiteNameSnapshot: fallback.name,
    clientNameSnapshot: fallback.client_name,
    nearestDistanceM: null,
    withinRadius: false,
  };
}
