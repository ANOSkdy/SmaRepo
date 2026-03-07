import assert from 'node:assert';
import { test } from 'node:test';

import { createInFlightRequest, isFreshPositionTimestamp } from '@/lib/stamp/geolocation-prefetch';

test('isFreshPositionTimestamp returns true only within max age', () => {
  assert.strictEqual(isFreshPositionTimestamp(1_000, 10_500, 10_000), true);
  assert.strictEqual(isFreshPositionTimestamp(1_000, 11_001, 10_000), false);
  assert.strictEqual(isFreshPositionTimestamp(Number.NaN, 11_001, 10_000), false);
});

test('createInFlightRequest deduplicates concurrent requests', async () => {
  let calls = 0;
  const run = createInFlightRequest(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true, call: calls };
  });

  const [first, second] = await Promise.all([run(), run()]);

  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(first, second);
});

test('createInFlightRequest allows a new request after completion', async () => {
  let calls = 0;
  const run = createInFlightRequest(async () => {
    calls += 1;
    return calls;
  });

  const first = await run();
  const second = await run();

  assert.strictEqual(first, 1);
  assert.strictEqual(second, 2);
  assert.strictEqual(calls, 2);
});
