import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { User } from 'next-auth';
import { query } from '@/lib/db';
import { ROUTES } from '@/src/constants/routes';
import { getAuthSecret } from '@/src/lib/env';

const secret = getAuthSecret();

type AuthUserRow = {
  id: string;
  username: string | null;
  password: string | null;
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

type AuthFailureReason =
  | 'MISSING_CREDENTIALS'
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
        const username = normalizeCredentialValue(credentials?.username);
        const password = normalizeCredentialValue(credentials?.password);

        if (!username || !password) {
          logAuthFailure('MISSING_CREDENTIALS');
          return null;
        }

        try {
          const result = await query<AuthUserRow>(
            `
              SELECT
                u.id::text AS id,
                COALESCE(to_jsonb(u)->>'username', to_jsonb(u)->>'email') AS username,
                to_jsonb(u)->>'password' AS password,
                COALESCE(to_jsonb(u)->>'name', to_jsonb(u)->>'username') AS name,
                COALESCE(to_jsonb(u)->>'role', 'user') AS role,
                COALESCE(to_jsonb(u)->>'userId', u.id::text) AS "userId",
                CASE
                  WHEN lower(COALESCE(to_jsonb(u)->>'active', 'true')) IN ('0', 'false', 'f', 'no', 'off') THEN FALSE
                  ELSE TRUE
                END AS active
              FROM users u
              WHERE COALESCE(to_jsonb(u)->>'username', to_jsonb(u)->>'email') = $1
              LIMIT 1
            `,
            [username],
          );

          const userRecord = result.rows[0];
          if (!userRecord || !userRecord.password) {
            logAuthFailure('USER_NOT_FOUND');
            return null;
          }

          if (!userRecord.active) {
            logAuthFailure('USER_INACTIVE');
            return null;
          }

          const isPasswordValid = password === userRecord.password;

          if (isPasswordValid) {
            return {
              id: userRecord.id,
              name: userRecord.name ?? userRecord.username ?? userRecord.id,
              email: userRecord.username ?? undefined,
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
        // User object is available on sign-in.
        token.id = user.id!;
        token.role = user.role!;
        token.userId = user.userId!;
      }
      return token;
    },
    session({ session, token }) {
      // Add custom properties to the session object
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
      console.error('Auth error', { code, metadata });
    },
  },
});
