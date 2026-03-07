export type NfcAttendanceState = {
  isWorking: boolean;
  stampType: 'IN' | 'OUT';
  workDescription: string;
  sessionStartAt: string | null;
  machineId: string | null;
  decidedSiteId: string | null;
  decidedSiteNameSnapshot: string | null;
};

type SessionRow = {
  status: 'open' | 'closed';
  work_description_snapshot: string | null;
  start_at: string;
  machine_id: string | null;
  decided_site_id: string | null;
  decided_site_name_snapshot: string | null;
};

type LogRow = {
  work_description: string | null;
};

type NfcAttendanceStateRepository = {
  findLatestSessionForWorkDate: (params: {
    userId: string;
    workDate: string;
  }) => Promise<SessionRow | null>;
  findLatestLogWorkDescriptionForWorkDate: (params: {
    userId: string;
    workDate: string;
  }) => Promise<string | null>;
};

function getJstWorkDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const defaultRepository: NfcAttendanceStateRepository = {
  async findLatestSessionForWorkDate({ userId, workDate }) {
    const { query } = await import('@/lib/db');
    const res = await query<SessionRow>(
      `
        SELECT
          status,
          work_description_snapshot,
          start_at,
          machine_id,
          decided_site_id,
          decided_site_name_snapshot
        FROM sessions
        WHERE user_id = $1::uuid
          AND work_date = $2::date
        ORDER BY start_at DESC
        LIMIT 1
      `,
      [userId, workDate],
    );

    return res.rows[0] ?? null;
  },

  async findLatestLogWorkDescriptionForWorkDate({ userId, workDate }) {
    const { query } = await import('@/lib/db');
    const res = await query<LogRow>(
      `
        SELECT work_description
        FROM logs
        WHERE user_id = $1::uuid
          AND work_date = $2::date
        ORDER BY stamped_at DESC
        LIMIT 1
      `,
      [userId, workDate],
    );

    return res.rows[0]?.work_description ?? null;
  },
};

export function createNfcAttendanceStateService(params?: {
  repo?: NfcAttendanceStateRepository;
  now?: Date;
}) {
  const repo = params?.repo ?? defaultRepository;
  const now = params?.now ?? new Date();

  async function getCurrentStateForUser(userId: string): Promise<NfcAttendanceState> {
    const workDate = getJstWorkDate(now);
    const latestSession = await repo.findLatestSessionForWorkDate({ userId, workDate });

    if (latestSession?.status === 'open') {
      return {
        isWorking: true,
        stampType: 'OUT',
        workDescription: latestSession.work_description_snapshot ?? '',
        sessionStartAt: latestSession.start_at,
        machineId: latestSession.machine_id,
        decidedSiteId: latestSession.decided_site_id,
        decidedSiteNameSnapshot: latestSession.decided_site_name_snapshot,
      };
    }

    const latestLogWorkDescription = await repo.findLatestLogWorkDescriptionForWorkDate({
      userId,
      workDate,
    });

    return {
      isWorking: false,
      stampType: 'IN',
      workDescription: latestSession?.work_description_snapshot ?? latestLogWorkDescription ?? '',
      sessionStartAt: null,
      machineId: latestSession?.machine_id ?? null,
      decidedSiteId: latestSession?.decided_site_id ?? null,
      decidedSiteNameSnapshot: latestSession?.decided_site_name_snapshot ?? null,
    };
  }

  return {
    getCurrentStateForUser,
  };
}
