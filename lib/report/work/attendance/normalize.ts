import { normalizeSessionStatus as normalizeSharedStatus } from '@/src/lib/sessions-reporting';
import type { AttendanceSession } from './sessions';

export type NormalizedSessionStatus = 'closed' | 'open' | 'unknown' | 'other';

export function normalizeSessionStatus(input: unknown): NormalizedSessionStatus {
  return normalizeSharedStatus(input);
}

export type NormalizedAttendanceSession = AttendanceSession & {
  status: NormalizedSessionStatus;
  statusNormalized: NormalizedSessionStatus;
  statusRaw: string | null;
};

export function normalizeSession(session: AttendanceSession): NormalizedAttendanceSession {
  const statusRaw = typeof session.status === 'string' ? session.status : null;
  const statusNormalized = normalizeSessionStatus(session.status);

  return {
    ...session,
    statusRaw,
    status: statusNormalized,
    statusNormalized,
  } satisfies NormalizedAttendanceSession;
}
