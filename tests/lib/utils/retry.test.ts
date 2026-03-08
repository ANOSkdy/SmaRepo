import assert from 'node:assert/strict';
import test from 'node:test';
import { withRetry } from '@/lib/utils/retry';

test('withRetry does not retry config env errors', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls += 1;
        const err = new Error('database env missing');
        err.name = 'DatabaseEnvError';
        throw err;
      }, 3, 1),
    (error: unknown) => error instanceof Error && error.name === 'DatabaseEnvError',
  );
  assert.equal(calls, 1);
});
