import { test } from 'node:test';
import assert from 'node:assert';

import {
  normalizeWorkTypeName,
  resolveWorkTypeId,
  type SqlTag,
} from '@/lib/stamp/resolveWorkTypeId';

test('resolveWorkTypeId prefers explicit UUID and skips lookup', async () => {
  const explicitId = '11111111-1111-4111-8111-111111111111';
  let called = false;
  const sql: SqlTag = async () => {
    called = true;
    return [];
  };

  const resolved = await resolveWorkTypeId(sql, explicitId, '積み込み');
  assert.strictEqual(resolved, explicitId);
  assert.strictEqual(called, false);
});

test('resolveWorkTypeId falls back to exact normalized work_description lookup', async () => {
  const sql: SqlTag = async (strings, ...values) => {
    const text = strings.join(' ');
    assert.match(text, /FROM work_types/);
    assert.match(text, /active = true/);
    assert.deepStrictEqual(values, ['積み込み 作業']);
    return [{ id: '22222222-2222-4222-8222-222222222222' }];
  };

  const resolved = await resolveWorkTypeId(sql, null, '  積み込み\n作業  ');
  assert.strictEqual(resolved, '22222222-2222-4222-8222-222222222222');
});

test('resolveWorkTypeId returns null when no matching work_type exists', async () => {
  const sql: SqlTag = async () => [];
  const resolved = await resolveWorkTypeId(sql, null, '未登録作業');
  assert.strictEqual(resolved, null);
});

test('normalizeWorkTypeName normalizes whitespace and case', () => {
  assert.strictEqual(normalizeWorkTypeName('  A  B\nC  '), 'a b c');
});
