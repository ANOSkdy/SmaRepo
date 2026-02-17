const SSLMODE_VERIFY_FULL = 'verify-full';
const SSLMODE_NEEDS_OVERRIDE = new Set(['prefer', 'require', 'verify-ca']);

export function normalizePostgresConnectionString(rawConnectionString: string): string {
  const normalizedInput = rawConnectionString.trim();
  if (!normalizedInput) {
    throw new Error('DB env missing');
  }

  const parsed = new URL(normalizedInput);
  const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();

  if (!sslmode || SSLMODE_NEEDS_OVERRIDE.has(sslmode)) {
    parsed.searchParams.set('sslmode', SSLMODE_VERIFY_FULL);
  }

  return parsed.toString();
}
