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
      SELECT COALESCE(to_jsonb(s)->>'name', to_jsonb(s)->>'siteName') AS name
      FROM sites s
      WHERE COALESCE(to_jsonb(s)->>'siteId', to_jsonb(s)->>'id', '') = $1
      ORDER BY COALESCE(to_jsonb(s)->>'id', '') ASC
      LIMIT 1
    `,
    [siteId],
  );

  const name = result.rows[0]?.name;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}
