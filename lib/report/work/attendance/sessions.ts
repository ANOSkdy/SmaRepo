import {
  fetchNormalizedSessions,
  type NormalizedSessionRow,
} from '@/src/lib/sessions-reporting';
import type { NormalizedSessionStatus } from './normalize';

export type AttendanceSession = {
  id: string;
  date: string | null;
  start: string | null;
  end: string | null;
  startMs: number | null;
  endMs: number | null;
  durationMin: number | null;
  siteName: string | null;
  workDescription: string | null;
  userId: number | null;
  userRecordId: string | null;
  userName: string | null;
  machineId: string | null;
  machineName: string | null;
  status: string | null;
  statusNormalized?: NormalizedSessionStatus;
  statusRaw?: string | null;
};

export type AttendanceSessionQuery = {
  startDate: string;
  endDate: string;
  userId?: number | null;
  siteName?: string | null;
  machineId?: string | null;
};

function toAttendanceSession(row: NormalizedSessionRow): AttendanceSession {
  return {
    id: row.id,
    date: row.date,
    start: row.start,
    end: row.end,
    startMs: row.startMs,
    endMs: row.endMs,
    durationMin: row.durationMin,
    siteName: row.siteName,
    workDescription: row.workDescription,
    userId: row.userId,
    userRecordId: row.userRecordId,
    userName: row.userName,
    machineId: row.machineId,
    machineName: row.machineName,
    status: row.status,
  };
}

export async function fetchAttendanceSessions(queryParams: AttendanceSessionQuery): Promise<AttendanceSession[]> {
  const rows = await fetchNormalizedSessions({
    startDate: queryParams.startDate,
    endDate: queryParams.endDate,
    userId: queryParams.userId,
    siteName: queryParams.siteName,
    machineId: queryParams.machineId,
    includeOpen: true,
  });

  return rows.filter((row) => row.date !== null).map(toAttendanceSession);
}
