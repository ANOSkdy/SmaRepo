import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { User } from 'next-auth';
import { query } from '@/lib/db';
import { ROUTES } from '@/src/constants/routes';
import { getAuthSecret } from '@/src/lib/env';

const secret = getAuthSecret();

type AuthUserRow = {
  id: string;
  loginId: string | null;
  passwordHash: string | null;
  name: string | null;
  role: string | null;
  userId: string | null;
  active: boolean;
};

function normalizeCredentialValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLoginIdentifier(value: unknown): string | null {
  const normalized = normalizeCredentialValue(value);
  return normalized ? normalized.toLowerCase() : null;
}

type AuthFailureReason =
  | 'MISSING_CREDENTIALS'
  | 'NO_USERS_SEEDED'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'BAD_PASSWORD'
  | 'DB_ERROR';

function logAuthFailure(reason: AuthFailureReason, detail?: string) {
  if (detail) {
    console.warn('[auth][credentials] failure', { reason, detail });
    return;
  }
  console.warn('[auth][credentials] failure', { reason });
}

function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }

  return error.message
    .replace(/postgres(?:ql)?:\/\/[^\s]*/gi, '[redacted-connection-string]')
    .slice(0, 200);
}

async function verifyPassword(inputPassword: string, storedPassword: string): Promise<boolean> {
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
    try {
      return await bcrypt.compare(inputPassword, storedPassword);
    } catch {
      return false;
    }
  }

  return inputPassword === storedPassword;
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  secret,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const loginId = normalizeLoginIdentifier(credentials?.username);
        const password = normalizeCredentialValue(credentials?.password);

        if (!loginId || !password) {
          logAuthFailure('MISSING_CREDENTIALS');
          return null;
        }

        try {
          const result = await query<AuthUserRow>(
            `
              SELECT
                u.id::text AS id,
                COALESCE(
                  to_jsonb(u)->>'username',
                  to_jsonb(u)->>'email',
                  to_jsonb(u)->>'userId',
                  to_jsonb(u)->'payload'->>'username',
                  to_jsonb(u)->'payload'->>'email',
                  to_jsonb(u)->'payload'->>'userId'
                ) AS "loginId",
                COALESCE(
                  to_jsonb(u)->>'password_hash',
                  to_jsonb(u)->>'password',
                  to_jsonb(u)->'payload'->>'password_hash',
                  to_jsonb(u)->'payload'->>'password'
                ) AS "passwordHash",
                COALESCE(
                  to_jsonb(u)->>'name',
                  to_jsonb(u)->>'username',
                  to_jsonb(u)->'payload'->>'name',
                  to_jsonb(u)->'payload'->>'username'
                ) AS name,
                COALESCE(
                  to_jsonb(u)->>'role',
                  to_jsonb(u)->'payload'->>'role',
                  'user'
                ) AS role,
                COALESCE(
                  to_jsonb(u)->>'userId',
                  to_jsonb(u)->>'username',
                  to_jsonb(u)->'payload'->>'userId',
                  to_jsonb(u)->'payload'->>'username',
                  u.id::text
                ) AS "userId",
                CASE
                  WHEN lower(COALESCE(
                    to_jsonb(u)->>'active',
                    to_jsonb(u)->'payload'->>'active',
                    'true'
                  )) IN ('0', 'false', 'f', 'no', 'off') THEN FALSE
                  ELSE TRUE
                END AS active
              FROM users u
              WHERE
                lower(COALESCE(to_jsonb(u)->>'username', to_jsonb(u)->'payload'->>'username', '')) = $1
                OR lower(COALESCE(to_jsonb(u)->>'email', to_jsonb(u)->'payload'->>'email', '')) = $1
                OR lower(COALESCE(to_jsonb(u)->>'userId', to_jsonb(u)->'payload'->>'userId', '')) = $1
              LIMIT 1
            `,
            [loginId],
          );

          const userRecord = result.rows[0];
          if (!userRecord || !userRecord.passwordHash) {
            const seedState = await query<{ hasUsers: boolean }>('SELECT EXISTS (SELECT 1 FROM users LIMIT 1) AS "hasUsers"');
            logAuthFailure(seedState.rows[0]?.hasUsers ? 'USER_NOT_FOUND' : 'NO_USERS_SEEDED');
            return null;
          }

          if (!userRecord.active) {
            logAuthFailure('USER_INACTIVE');
            return null;
          }

          const isPasswordValid = await verifyPassword(password, userRecord.passwordHash);

          if (isPasswordValid) {
            return {
              id: userRecord.id,
              name: userRecord.name ?? userRecord.loginId ?? userRecord.id,
              email: userRecord.loginId ?? undefined,
              role: userRecord.role ?? 'user',
              userId: userRecord.userId ?? userRecord.id,
            } as User;
          }

          logAuthFailure('BAD_PASSWORD');
          return null;
        } catch (error) {
          logAuthFailure('DB_ERROR', sanitizeErrorMessage(error));
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role!;
        token.userId = user.userId!;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.userId = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: ROUTES.LOGIN,
  },
  logger: {
    error(code, ...metadata) {
      const authCode = typeof code === 'string' ? code : code?.name;
      if (authCode === 'CredentialsSignin') {
        return;
      }
      console.error('Auth error', { code: authCode, metadata });
    },
  },
});
