import { test } from 'node:test';
import assert from 'node:assert';

import {
  createNfcAttendanceStateService,
  resolveNfcInitialViewState,
} from '@/lib/services/nfcAttendanceState';

type SessionRow = {
  status: 'open' | 'closed';
  work_description_snapshot: string | null;
  start_at: string;
  machine_id: string | null;
  decided_site_id: string | null;
  decided_site_name_snapshot: string | null;
};

function createRepo(params: {
  latestSession: SessionRow | null;
  latestLogWorkDescription?: string | null;
}) {
  let latestLogCallCount = 0;

  return {
    state: {
      get latestLogCallCount() {
        return latestLogCallCount;
      },
    },
    repo: {
      async findLatestSessionForWorkDate() {
        return params.latestSession;
      },
      async findLatestLogWorkDescriptionForWorkDate() {
        latestLogCallCount += 1;
        return params.latestLogWorkDescription ?? null;
      },
    },
  };
}

test('JST当日open sessionがある場合は勤務中状態(OUT可能)で復元する', async () => {
  const { repo, state } = createRepo({
    latestSession: {
      status: 'open',
      work_description_snapshot: '積み込み',
      start_at: '2026-02-20T00:00:00.000Z',
      machine_id: '22222222-2222-4222-8222-222222222222',
      decided_site_id: '33333333-3333-4333-8333-333333333333',
      decided_site_name_snapshot: 'A現場',
    },
    latestLogWorkDescription: '不要',
  });

  const service = createNfcAttendanceStateService({
    repo,
    now: new Date('2026-02-20T01:00:00.000Z'),
  });

  const result = await service.getCurrentStateForUser('11111111-1111-4111-8111-111111111111');

  assert.strictEqual(result.isWorking, true);
  assert.strictEqual(result.stampType, 'OUT');
  assert.strictEqual(result.workDescription, '積み込み');
  assert.strictEqual(result.sessionStartAt, '2026-02-20T00:00:00.000Z');
  assert.strictEqual(state.latestLogCallCount, 0);
});

test('JST当日open sessionがない場合はIN可能状態を返す', async () => {
  const { repo } = createRepo({
    latestSession: {
      status: 'closed',
      work_description_snapshot: '荷下ろし',
      start_at: '2026-02-20T00:00:00.000Z',
      machine_id: '22222222-2222-4222-8222-222222222222',
      decided_site_id: null,
      decided_site_name_snapshot: null,
    },
    latestLogWorkDescription: '荷下ろし',
  });

  const service = createNfcAttendanceStateService({
    repo,
    now: new Date('2026-02-20T10:00:00.000Z'),
  });

  const result = await service.getCurrentStateForUser('11111111-1111-4111-8111-111111111111');

  assert.strictEqual(result.isWorking, false);
  assert.strictEqual(result.stampType, 'IN');
  assert.strictEqual(result.workDescription, '荷下ろし');
  assert.strictEqual(result.sessionStartAt, null);
});

test('前日open sessionのみなら新しいJST日付ではIN可能状態を返す', async () => {
  const { repo } = createRepo({
    latestSession: null,
    latestLogWorkDescription: null,
  });

  const service = createNfcAttendanceStateService({
    repo,
    now: new Date('2026-02-21T00:10:00+09:00'),
  });

  const result = await service.getCurrentStateForUser('11111111-1111-4111-8111-111111111111');

  assert.strictEqual(result.isWorking, false);
  assert.strictEqual(result.stampType, 'IN');
  assert.strictEqual(result.workDescription, '');
});

test('リロード/再訪問相当で毎回サーバー由来stateを返せる', async () => {
  const { repo } = createRepo({
    latestSession: {
      status: 'open',
      work_description_snapshot: '検品',
      start_at: '2026-02-20T03:30:00.000Z',
      machine_id: '22222222-2222-4222-8222-222222222222',
      decided_site_id: null,
      decided_site_name_snapshot: null,
    },
  });

  const service = createNfcAttendanceStateService({
    repo,
    now: new Date('2026-02-20T12:00:00.000Z'),
  });

  const [first, second] = await Promise.all([
    service.getCurrentStateForUser('11111111-1111-4111-8111-111111111111'),
    service.getCurrentStateForUser('11111111-1111-4111-8111-111111111111'),
  ]);

  assert.strictEqual(first.stampType, 'OUT');
  assert.strictEqual(second.stampType, 'OUT');
  assert.strictEqual(first.workDescription, '検品');
  assert.strictEqual(second.workDescription, '検品');
});


test('open sessionあり + 同一machineIdなら勤務中状態(OUT)を復元する', () => {
  const view = resolveNfcInitialViewState({
    attendanceState: {
      isWorking: true,
      stampType: 'OUT',
      workDescription: '積み込み',
      sessionStartAt: '2026-02-20T00:00:00.000Z',
      machineId: '22222222-2222-4222-8222-222222222222',
      decidedSiteId: null,
      decidedSiteNameSnapshot: null,
    },
    requestedMachineIdRaw: '1003',
    resolvedMachineId: '22222222-2222-4222-8222-222222222222',
  });

  assert.strictEqual(view.initialStampType, 'OUT');
  assert.strictEqual(view.machineSwitchSourceMachineId, null);
});

test('open sessionあり + 異なるmachineIdなら機械切替フローを優先(INへ)する', () => {
  const view = resolveNfcInitialViewState({
    attendanceState: {
      isWorking: true,
      stampType: 'OUT',
      workDescription: '積み込み',
      sessionStartAt: '2026-02-20T00:00:00.000Z',
      machineId: '22222222-2222-4222-8222-222222222222',
      decidedSiteId: null,
      decidedSiteNameSnapshot: null,
    },
    requestedMachineIdRaw: '1004',
    resolvedMachineId: '99999999-9999-4999-8999-999999999999',
  });

  assert.strictEqual(view.initialStampType, 'IN');
  assert.strictEqual(view.machineSwitchSourceMachineId, '22222222-2222-4222-8222-222222222222');
});

test('open sessionなし + machineId指定ありでも通常INフローを維持する', () => {
  const view = resolveNfcInitialViewState({
    attendanceState: {
      isWorking: false,
      stampType: 'IN',
      workDescription: '',
      sessionStartAt: null,
      machineId: null,
      decidedSiteId: null,
      decidedSiteNameSnapshot: null,
    },
    requestedMachineIdRaw: '1004',
    resolvedMachineId: '99999999-9999-4999-8999-999999999999',
  });

  assert.strictEqual(view.initialStampType, 'IN');
  assert.strictEqual(view.machineSwitchSourceMachineId, null);
});


test('URL machineId未指定ならopen sessionをそのまま復元する', () => {
  const view = resolveNfcInitialViewState({
    attendanceState: {
      isWorking: true,
      stampType: 'OUT',
      workDescription: '検品',
      sessionStartAt: '2026-02-20T03:30:00.000Z',
      machineId: '22222222-2222-4222-8222-222222222222',
      decidedSiteId: null,
      decidedSiteNameSnapshot: null,
    },
    requestedMachineIdRaw: '',
    resolvedMachineId: '99999999-9999-4999-8999-999999999999',
  });

  assert.strictEqual(view.initialStampType, 'OUT');
  assert.strictEqual(view.machineSwitchSourceMachineId, null);
});
