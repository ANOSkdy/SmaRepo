import { query } from '@/lib/db';

type SiteNameRow = { name: string | null };

export async function resolveSiteName(siteId?: string, siteName?: string): Promise<string | null> {
  if (siteName && siteName.trim().length > 0) {
    return siteName.trim();
  }
  if (!siteId) {
    return null;
  }

  const result = await query<SiteNameRow>(
    `
      SELECT NULLIF(TRIM(s.name), '') AS name
      FROM sites s
      WHERE s.id::text = $1
      LIMIT 1
    `,
    [siteId],
  );

  const name = result.rows[0]?.name;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}
