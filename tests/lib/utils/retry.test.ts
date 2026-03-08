import assert from 'node:assert/strict';
import test from 'node:test';
import { withRetry } from '@/lib/utils/retry';

test('withRetry does not retry AirtableEnvError', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls += 1;
        const err = new Error('AIRTABLE env missing');
        err.name = 'AirtableEnvError';
        throw err;
      }, 3, 1),
    (error: unknown) => error instanceof Error && error.name === 'AirtableEnvError',
  );
  assert.equal(calls, 1);
});
