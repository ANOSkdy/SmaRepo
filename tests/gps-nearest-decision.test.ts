import { test } from 'node:test';
import assert from 'node:assert';

import {
  computeWithinRadius,
  resolveNearestActiveSiteDecision,
  type SqlTag,
} from '@/lib/stamp/gpsNearest';

function createSqlMock({
  nearestRows = [],
  fallbackRows = [],
}: { nearestRows?: unknown[]; fallbackRows?: unknown[] } = {}) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql: SqlTag = async (strings, ...values) => {
    const text = strings.join(' ');
    calls.push({ text, values });
    if (text.includes('ST_Distance(')) {
      assert.match(text, /WHERE\s+active\s*=\s*true/i);
      return nearestRows;
    }
    if (text.includes('ORDER BY priority DESC NULLS LAST')) {
      return fallbackRows;
    }
    throw new Error(`Unexpected SQL: ${text}`);
  };
  return { sql, calls };
}

test('nearest active site is outside radius -> decided site saved, within_radius=false', async () => {
  const { sql } = createSqlMock({
    nearestRows: [
      {
        id: 'site-outside',
        name: 'Outside Site',
        client_name: 'Client A',
        radius_m: 100,
        distance_m: 250,
      },
    ],
  });

  const result = await resolveNearestActiveSiteDecision(sql, 35, 139);
  assert.strictEqual(result.decidedSiteId, 'site-outside');
  assert.strictEqual(result.decidedSiteNameSnapshot, 'Outside Site');
  assert.strictEqual(result.clientNameSnapshot, 'Client A');
  assert.strictEqual(result.nearestDistanceM, 250);
  assert.strictEqual(result.withinRadius, false);
});

test('nearest active site is inside radius -> decided site saved, within_radius=true', async () => {
  const { sql } = createSqlMock({
    nearestRows: [
      {
        id: 'site-inside',
        name: 'Inside Site',
        client_name: 'Client B',
        radius_m: 300,
        distance_m: 200,
      },
    ],
  });

  const result = await resolveNearestActiveSiteDecision(sql, 35, 139);
  assert.strictEqual(result.decidedSiteId, 'site-inside');
  assert.strictEqual(result.withinRadius, true);
});

test('radius_m is null -> decided site saved, within_radius=false', async () => {
  const { sql } = createSqlMock({
    nearestRows: [
      {
        id: 'site-null-radius',
        name: 'Null Radius Site',
        client_name: 'Client C',
        radius_m: null,
        distance_m: 10,
      },
    ],
  });

  const result = await resolveNearestActiveSiteDecision(sql, 35, 139);
  assert.strictEqual(result.decidedSiteId, 'site-null-radius');
  assert.strictEqual(result.withinRadius, false);
});

test('inactive sites are ignored by active=true filter in nearest query', async () => {
  const { sql, calls } = createSqlMock({
    nearestRows: [
      {
        id: 'active-site',
        name: 'Active Site',
        client_name: 'Client D',
        radius_m: 1000,
        distance_m: 500,
      },
    ],
  });

  const result = await resolveNearestActiveSiteDecision(sql, 35, 139);
  assert.strictEqual(result.decidedSiteId, 'active-site');
  const nearestQuery = calls.find((c) => c.text.includes('ST_Distance('));
  assert.ok(nearestQuery, 'nearest query should be executed');
  assert.match(nearestQuery.text, /WHERE\s+active\s*=\s*true/i);
});

test('computeWithinRadius handles null radius as false', () => {
  assert.strictEqual(computeWithinRadius(10, null), false);
});
