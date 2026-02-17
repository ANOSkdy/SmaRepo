import 'server-only';

const DATABASE_ENV_KEYS = ['DATABASE_URL', 'NEON_DATABASE_URL'] as const;

export function getDatabaseUrl(): string {
  for (const key of DATABASE_ENV_KEYS) {
    const value = process.env[key];
    if (value) return value;
  }

  throw new Error('DB env missing');
}

export function hasDatabaseUrl(): boolean {
  return DATABASE_ENV_KEYS.some((key) => Boolean(process.env[key]));
}
