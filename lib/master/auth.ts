import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';

type AdminSessionResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'UNAUTHORIZED' | 'FORBIDDEN' };

export async function getAdminSession(): Promise<AdminSessionResult> {
  const session = await auth();

  if (!session?.user) {
    return { ok: false, reason: 'UNAUTHORIZED' };
  }

  if (session.user.role !== 'admin') {
    return { ok: false, reason: 'FORBIDDEN' };
  }

  return { ok: true, session };
}
