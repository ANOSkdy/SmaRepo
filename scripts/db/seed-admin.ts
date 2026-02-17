import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizePostgresConnectionString } from '@/lib/postgres-connection';

type PoolLike = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  end: () => Promise<void>;
};

type PgModule = {
  Pool: new (config: { connectionString: string }) => PoolLike;
};

async function loadPgModule(): Promise<PgModule> {
  const moduleName = 'pg';
  return (await import(moduleName)) as PgModule;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DB env missing');
  }

  const email = normalizeIdentifier(getRequiredEnv('SEED_ADMIN_EMAIL'));
  const password = getRequiredEnv('SEED_ADMIN_PASSWORD');
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Admin';
  const role = process.env.SEED_ADMIN_ROLE?.trim() || 'admin';
  const userId = process.env.SEED_ADMIN_USER_ID?.trim() || email;
  const passwordHash = await bcrypt.hash(password, 12);

  const { Pool } = await loadPgModule();
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(databaseUrl),
  });

  try {
    const columnResult = await pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
      `,
    );
    const columns = new Set(columnResult.rows.map((row) => row.column_name));
    const hasPayload = columns.has('payload');

    if (hasPayload) {
      const existing = await pool.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM users
          WHERE lower(COALESCE(payload->>'email', payload->>'username', payload->>'userId', '')) = $1
          LIMIT 1
        `,
        [email],
      );

      if (existing.rows[0]) {
        await pool.query(
          `
            UPDATE users
            SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
              'email', $1,
              'username', $1,
              'userId', $2,
              'name', $3,
              'role', $4,
              'active', true,
              'password_hash', $5
            )
            WHERE id::text = $6
          `,
          [email, userId, name, role, passwordHash, existing.rows[0].id],
        );
      } else {
        await pool.query(
          `
            INSERT INTO users (id, payload)
            VALUES (
              $1,
              jsonb_build_object(
                'email', $2,
                'username', $2,
                'userId', $3,
                'name', $4,
                'role', $5,
                'active', true,
                'password_hash', $6
              )
            )
          `,
          [randomUUID(), email, userId, name, role, passwordHash],
        );
      }

      console.log('Seed admin completed (payload mode).');
      return;
    }

    const available = (columnName: string) => columns.has(columnName);

    const existingWhere: string[] = [];
    const existingParams: unknown[] = [];
    if (available('email')) {
      existingParams.push(email);
      existingWhere.push(`lower(email::text) = $${existingParams.length}`);
    }
    if (available('username')) {
      existingParams.push(email);
      existingWhere.push(`lower(username::text) = $${existingParams.length}`);
    }
    if (available('userId')) {
      existingParams.push(email);
      existingWhere.push(`lower("userId"::text) = $${existingParams.length}`);
    }

    if (existingWhere.length === 0) {
      throw new Error('users table does not include supported login columns (email/username/userId/payload)');
    }

    const existing = await pool.query<{ id: string }>(
      `SELECT id::text AS id FROM users WHERE ${existingWhere.join(' OR ')} LIMIT 1`,
      existingParams,
    );

    const updateColumns: string[] = [];
    const updateParams: unknown[] = [];

    const setColumn = (columnName: string, value: unknown) => {
      if (!available(columnName)) return;
      updateParams.push(value);
      updateColumns.push(`"${columnName}" = $${updateParams.length}`);
    };

    setColumn('email', email);
    setColumn('username', email);
    setColumn('userId', userId);
    setColumn('name', name);
    setColumn('role', role);
    setColumn('active', true);
    if (available('password_hash')) {
      setColumn('password_hash', passwordHash);
    } else {
      setColumn('password', passwordHash);
    }

    if (existing.rows[0]) {
      updateParams.push(existing.rows[0].id);
      await pool.query(`UPDATE users SET ${updateColumns.join(', ')} WHERE id::text = $${updateParams.length}`, updateParams);
      console.log('Seed admin completed (updated existing user).');
      return;
    }

    const insertColumns: string[] = [];
    const insertValues: unknown[] = [];

    const addInsert = (columnName: string, value: unknown) => {
      if (!available(columnName)) return;
      insertColumns.push(`"${columnName}"`);
      insertValues.push(value);
    };

    if (available('id')) {
      addInsert('id', randomUUID());
    }
    addInsert('email', email);
    addInsert('username', email);
    addInsert('userId', userId);
    addInsert('name', name);
    addInsert('role', role);
    addInsert('active', true);
    if (available('password_hash')) {
      addInsert('password_hash', passwordHash);
    } else {
      addInsert('password', passwordHash);
    }

    if (insertColumns.length === 0) {
      throw new Error('users table does not include writable columns for seeding');
    }

    const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');
    await pool.query(`INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})`, insertValues);
    console.log('Seed admin completed (inserted new user).');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error('db:seed-admin failed', { message });
  process.exitCode = 1;
});
