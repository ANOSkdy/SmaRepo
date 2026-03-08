import 'server-only';

import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { resolveUserIdentity } from '@/lib/services/userIdentity';

type Role = 'admin' | 'user' | string;

type SessionLike = {
  user?: Record<string, unknown> | null;
} | null;

type UserRoleRow = {
  role: unknown;
};

function normalizeRoleString(value: string): Role {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'user';
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'user') return 'user';
  if (lower === 'admin') return 'admin';
  return trimmed as Role;
}

function normRole(value: unknown): Role | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return normalizeRoleString(value);
  }
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string') {
      return normalizeRoleString(name);
    }
  }
  return null;
}

function coerceToString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}

function uniqueStrings(values: Array<unknown>): string[] {
  const result = new Set<string>();
  for (const value of values) {
    const coerced = coerceToString(value);
    if (coerced) {
      result.add(coerced);
    }
  }
  return Array.from(result);
}

async function queryUserRoleBy(field: 'id' | 'user_id' | 'name' | 'username' | 'email', value: string): Promise<Role | null> {
  const sql = `
    SELECT role
    FROM users
    WHERE ${field} = $1
      AND active = true
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1
  `;
  const res = await query<UserRoleRow>(sql, [value]);
  return normRole(res.rows[0]?.role ?? null);
}

export async function getCurrentUserRole(): Promise<Role> {
  const session = (await auth()) as SessionLike;
  const sessionUser = (session?.user as Record<string, unknown> | undefined) ?? undefined;
  const sessionRole = normRole(sessionUser?.role);
  if (sessionRole) {
    return sessionRole;
  }

  const identity = sessionUser ? resolveUserIdentity({ fields: sessionUser }) : undefined;

  const candidateIds = uniqueStrings([
    sessionUser?.id,
    sessionUser?.userId,
    identity?.userRecId,
    identity?.employeeCode,
  ]);

  for (const id of candidateIds) {
    try {
      const byIdRole = await queryUserRoleBy('id', id);
      if (byIdRole) return byIdRole;
    } catch {
      // ignore and continue to fallback keys
    }
    try {
      const byUserIdRole = await queryUserRoleBy('user_id', id);
      if (byUserIdRole) return byUserIdRole;
    } catch {
      // ignore and continue to fallback keys
    }
  }

  const candidateUsernames = uniqueStrings([
    sessionUser?.username,
    identity?.username,
  ]);
  for (const username of candidateUsernames) {
    try {
      const role = await queryUserRoleBy('username', username);
      if (role) return role;
    } catch {
      // ignore and continue
    }
  }

  const candidateNames = uniqueStrings([sessionUser?.name]);
  for (const name of candidateNames) {
    try {
      const role = await queryUserRoleBy('name', name);
      if (role) return role;
    } catch {
      // ignore and continue
    }
  }

  const candidateEmails = uniqueStrings([
    sessionUser?.email,
    sessionUser?.login,
  ]);
  for (const email of candidateEmails) {
    try {
      const role = await queryUserRoleBy('email', email);
      if (role) return role;
    } catch {
      // ignore and continue
    }
  }

  return 'user';
}

export type { Role };

export function isRoleUser(role: Role | null | undefined): boolean {
  const normalized = normRole(role ?? null);
  return (normalized ?? 'user') === 'user';
}
