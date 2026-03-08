import { hoursFromMinutes } from '@/src/lib/timecalc';
import {
  resolveBreakPolicy,
  isBreakPolicyEnabled,
  type BreakPolicyResult,
} from '@/lib/policies/breakDeduction';
import { buildMonthDays, type AttendanceDay } from './dateUtils';
import { computeDailyAttendance } from './computeDailyAttendance';
import type { AttendanceSession } from './sessions';

export type AttendanceUserRow = {
  userId: number | null;
  name: string;
  daily: Record<
    string,
    {
      hours: number;
      minutesRounded: number;
      breakDeductMin: number;
      sessionsCount: number;
      hasAnomaly: boolean;
      breakPolicyApplied: boolean;
    }
  >;
  totals: {
    hours: number;
    minutesRounded: number;
    workDays: number;
    breakDeductMin: number;
    overtimeHours: number;
    breakPolicyApplied: boolean;
  };
};

export type MonthlyAttendanceResponse = {
  days: AttendanceDay[];
  rows: AttendanceUserRow[];
  dayTotals: Record<string, { hours: number; minutesRounded: number }>;
  generatedAt: string;
};

export type AttendanceUser = {
  userId: number | null;
  name: string | null;
  userRecordId?: string | null;
};

const OVERTIME_THRESHOLD_MINUTES = 7.5 * 60;

function resolveUserKey(session: AttendanceSession): string {
  if (session.userId != null) {
    return `userId:${session.userId}`;
  }
  if (session.userRecordId) {
    return `record:${session.userRecordId}`;
  }
  if (session.userName) {
    return `name:${session.userName}`;
  }
  return 'unknown';
}

function buildUserMap(users: AttendanceUser[]): Map<string, AttendanceUser> {
  const map = new Map<string, AttendanceUser>();
  for (const user of users) {
    if (user.userId != null) {
      map.set(`userId:${user.userId}`, user);
    }
    if (user.userRecordId) {
      map.set(`record:${user.userRecordId}`, user);
    }
  }
  return map;
}

/**
 * 月次勤怠の集計データを作成する。
 */
export async function aggregateMonthlyAttendance(
  sessions: AttendanceSession[],
  users: AttendanceUser[],
  month: string,
): Promise<MonthlyAttendanceResponse> {
  const days = buildMonthDays(month);
  const dayTotals = new Map<string, { minutesRounded: number }>();
  const userMap = buildUserMap(users);
  const grouped = new Map<string, Map<string, AttendanceSession[]>>();
  const policyCache = new Map<string, BreakPolicyResult>();
  const breakPolicyEnabled = isBreakPolicyEnabled();

  for (const session of sessions) {
    if (!session.date) {
      continue;
    }
    const userKey = resolveUserKey(session);
    const byUser = grouped.get(userKey) ?? new Map<string, AttendanceSession[]>();
    const entries = byUser.get(session.date) ?? [];
    entries.push(session);
    byUser.set(session.date, entries);
    grouped.set(userKey, byUser);
  }

  const rows: AttendanceUserRow[] = [];

  for (const [userKey, dayMap] of grouped.entries()) {
    const userInfo = userMap.get(userKey);
    const sampleSession = dayMap.values().next().value?.[0] as AttendanceSession | undefined;
    const userId = userInfo?.userId ?? sampleSession?.userId ?? null;
    const name = userInfo?.name ?? sampleSession?.userName ?? '未登録ユーザー';

    const policy = await resolveBreakPolicy(
      {
        userRecordId: userInfo?.userRecordId ?? sampleSession?.userRecordId,
        userId,
        userName: name,
      },
      policyCache,
    );
    const breakPolicyApplied = breakPolicyEnabled && !policy.excludeBreakDeduction;

    const daily: AttendanceUserRow['daily'] = {};
    let totalMinutes = 0;
    let totalBreakDeduct = 0;
    let workDays = 0;
    let overtimeMinutesTotal = 0;

    for (const [date, sessionsForDay] of dayMap.entries()) {
      const summary = computeDailyAttendance(sessionsForDay, {
        skipStandardBreakDeduction: !breakPolicyApplied,
      });
      const minutesRounded = summary.roundedMinutes;
      const hours = hoursFromMinutes(minutesRounded);
      const hasAnomaly = summary.anomalies.length > 0;
      const overtimeMinutes = Math.max(0, minutesRounded - OVERTIME_THRESHOLD_MINUTES);

      daily[date] = {
        hours,
        minutesRounded,
        breakDeductMin: summary.deductBreakMinutes,
        sessionsCount: summary.sessionsCount,
        hasAnomaly,
        breakPolicyApplied: summary.breakPolicyApplied,
      };

      totalMinutes += minutesRounded;
      totalBreakDeduct += summary.deductBreakMinutes;
      if (minutesRounded > 0) {
        workDays += 1;
      }
      overtimeMinutesTotal += overtimeMinutes;

      const dayTotal = dayTotals.get(date) ?? { minutesRounded: 0 };
      dayTotal.minutesRounded += minutesRounded;
      dayTotals.set(date, dayTotal);
    }

    rows.push({
      userId,
      name,
      daily,
      totals: {
        hours: hoursFromMinutes(totalMinutes),
        minutesRounded: totalMinutes,
        workDays,
        breakDeductMin: totalBreakDeduct,
        overtimeHours: hoursFromMinutes(overtimeMinutesTotal),
        breakPolicyApplied,
      },
    });
  }

  rows.sort((a, b) => {
    const idA = a.userId;
    const idB = b.userId;
    if (idA != null && idB != null && idA !== idB) {
      return idA - idB;
    }
    if (idA != null && idB == null) return -1;
    if (idA == null && idB != null) return 1;

    const nameA = a.name ?? '';
    const nameB = b.name ?? '';
    const byName = nameA.localeCompare(nameB, 'ja');
    if (byName !== 0) {
      return byName;
    }
    return 0;
  });

  const dayTotalsRecord: Record<string, { hours: number; minutesRounded: number }> = {};
  for (const day of days) {
    const total = dayTotals.get(day.date) ?? { minutesRounded: 0 };
    dayTotalsRecord[day.date] = {
      minutesRounded: total.minutesRounded,
      hours: hoursFromMinutes(total.minutesRounded),
    };
  }

  return {
    days,
    rows,
    dayTotals: dayTotalsRecord,
    generatedAt: new Date().toISOString(),
  } satisfies MonthlyAttendanceResponse;
}
