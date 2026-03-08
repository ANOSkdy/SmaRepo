import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

export type BreakPolicyIdentity = {
  userRecordId?: string | null;
  userId?: string | number | null;
  userName?: string | null;
};

export type BreakPolicySource = 'recordId' | 'userId' | 'userName' | 'default';

export type BreakPolicyResult = {
  excludeBreakDeduction: boolean;
  source: BreakPolicySource;
};

type UserPolicyRecord = {
  id: string;
  name: string | null;
  userId: number | null;
  excludeBreakDeduction: boolean;
};

type ResolverDeps = {
  findByRecordId: (recordId: string) => Promise<UserPolicyRecord | null>;
  findByUserId: (userId: number) => Promise<UserPolicyRecord | null>;
  findByUserName: (userName: string) => Promise<UserPolicyRecord[]>;
  isPolicyEnabled: () => boolean;
};

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('ja');
}

function makeCacheKeys(identity: BreakPolicyIdentity): string[] {
  const keys: string[] = [];
  const recordId = asString(identity.userRecordId);
  if (recordId) keys.push(`record:${recordId}`);
  const userId = asNumber(identity.userId);
  if (userId != null) keys.push(`userId:${userId}`);
  const userName = asString(identity.userName);
  if (userName) keys.push(`userName:${normalizeName(userName)}`);
  return keys;
}

const DEFAULT_POLICY: BreakPolicyResult = { excludeBreakDeduction: false, source: 'default' };

function toPolicy(record: UserPolicyRecord | null, source: Exclude<BreakPolicySource, 'default'>): BreakPolicyResult {
  if (!record) {
    return DEFAULT_POLICY;
  }
  return {
    excludeBreakDeduction: Boolean(record.excludeBreakDeduction),
    source,
  };
}

type UserPolicyRow = {
  id: string;
  name: string | null;
  user_id_number: number | null;
  exclude_break_deduction: boolean;
};

function toPolicyRecord(row: UserPolicyRow): UserPolicyRecord {
  return {
    id: row.id,
    name: asString(row.name),
    userId: asNumber(row.user_id_number),
    excludeBreakDeduction: Boolean(row.exclude_break_deduction),
  };
}

async function queryPolicyRows(whereClause: string, values: Array<string | number>): Promise<UserPolicyRecord[]> {
  const result = await query<UserPolicyRow>(
    `
      SELECT
        u.id::text AS id,
        COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), '')) AS name,
        CASE
          WHEN NULLIF(TRIM(COALESCE(u.username, '')), '') ~ '^[0-9]+$'
            THEN NULLIF(TRIM(COALESCE(u.username, '')), '')::int
          ELSE NULL
        END AS user_id_number,
        CASE
          WHEN LOWER(TRIM(COALESCE(to_jsonb(u)->>'excludeBreakDeduction', to_jsonb(u)->>'exclude_break_deduction', 'false'))) IN ('true', '1')
            THEN true
          ELSE false
        END AS exclude_break_deduction
      FROM users u
      ${whereClause}
    `,
    values,
  );
  return result.rows.map(toPolicyRecord);
}

async function buildDeps(): Promise<ResolverDeps> {
  return {
    findByRecordId: async (recordId) => {
      const rows = await queryPolicyRows('WHERE u.id::text = $1 LIMIT 1', [recordId]);
      return rows[0] ?? null;
    },
    findByUserId: async (userId) => {
      const rows = await queryPolicyRows(
        `
          WHERE CASE
            WHEN NULLIF(TRIM(COALESCE(u.username, '')), '') ~ '^[0-9]+$'
              THEN NULLIF(TRIM(COALESCE(u.username, '')), '')::int
            ELSE NULL
          END = $1
          LIMIT 1
        `,
        [Math.round(userId)],
      );
      return rows[0] ?? null;
    },
    findByUserName: async (userName) => {
      const rows = await queryPolicyRows(
        `
          WHERE LOWER(TRIM(COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), '')))) = LOWER(TRIM($1))
        `,
        [userName],
      );
      return rows;
    },
    isPolicyEnabled: () => process.env.ENABLE_BREAK_POLICY !== 'false',
  };
}

export function createBreakPolicyResolver(injected?: Partial<ResolverDeps>) {
  let depsPromise: Promise<ResolverDeps> | null = null;

  const getDeps = async (): Promise<ResolverDeps> => {
    if (
      injected?.findByRecordId &&
      injected?.findByUserId &&
      injected?.findByUserName &&
      injected?.isPolicyEnabled
    ) {
      return {
        findByRecordId: injected.findByRecordId,
        findByUserId: injected.findByUserId,
        findByUserName: injected.findByUserName,
        isPolicyEnabled: injected.isPolicyEnabled,
      };
    }
    if (!depsPromise) {
      depsPromise = buildDeps();
    }
    return depsPromise;
  };

  return async function resolveBreakPolicy(
    identity: BreakPolicyIdentity,
    cache?: Map<string, BreakPolicyResult>,
  ): Promise<BreakPolicyResult> {
    const deps = await getDeps();
    if (!deps.isPolicyEnabled()) {
      return DEFAULT_POLICY;
    }

    const cacheKeys = makeCacheKeys(identity);
    if (cache && cacheKeys.length > 0) {
      for (const key of cacheKeys) {
        const found = cache.get(key);
        if (found) {
          return found;
        }
      }
    }

    const recordId = asString(identity.userRecordId);
    if (recordId) {
      const policy = toPolicy(await deps.findByRecordId(recordId), 'recordId');
      if (cache) {
        for (const key of cacheKeys) cache.set(key, policy);
      }
      return policy;
    }

    const userId = asNumber(identity.userId);
    if (userId != null) {
      const policy = toPolicy(await deps.findByUserId(userId), 'userId');
      if (cache) {
        for (const key of cacheKeys) cache.set(key, policy);
      }
      return policy;
    }

    const userName = asString(identity.userName);
    if (userName) {
      const matches = await deps.findByUserName(userName);
      let policy = DEFAULT_POLICY;
      if (matches.length === 1) {
        policy = toPolicy(matches[0], 'userName');
      } else if (matches.length > 1) {
        logger.warn('[break-policy] duplicate users matched by userName. fallback to default.', {
          userName,
          matchedCount: matches.length,
        });
      }
      if (cache) {
        for (const key of cacheKeys) cache.set(key, policy);
      }
      return policy;
    }

    return DEFAULT_POLICY;
  };
}

const defaultResolver = createBreakPolicyResolver();

export async function resolveBreakPolicy(identity: BreakPolicyIdentity, cache?: Map<string, BreakPolicyResult>) {
  return defaultResolver(identity, cache);
}

export function isBreakPolicyEnabled() {
  return process.env.ENABLE_BREAK_POLICY !== 'false';
}
