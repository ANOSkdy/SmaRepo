import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePostgresConnectionString } from '@/lib/postgres-connection';

test('sslmode が未設定なら verify-full を付与する', () => {
  const url = normalizePostgresConnectionString('postgres://user:pass@host.neon.tech/dbname');
  assert.equal(new URL(url).searchParams.get('sslmode'), 'verify-full');
});

test('sslmode=prefer は verify-full に上書きする', () => {
  const url = normalizePostgresConnectionString('postgres://user:pass@host.neon.tech/dbname?sslmode=prefer');
  assert.equal(new URL(url).searchParams.get('sslmode'), 'verify-full');
});

test('sslmode=require は verify-full に上書きする', () => {
  const url = normalizePostgresConnectionString('postgres://user:pass@host.neon.tech/dbname?sslmode=require');
  assert.equal(new URL(url).searchParams.get('sslmode'), 'verify-full');
});

test('sslmode=verify-ca は verify-full に上書きする', () => {
  const url = normalizePostgresConnectionString('postgres://user:pass@host.neon.tech/dbname?sslmode=verify-ca');
  assert.equal(new URL(url).searchParams.get('sslmode'), 'verify-full');
});

test('sslmode=verify-full は維持する', () => {
  const url = normalizePostgresConnectionString('postgres://user:pass@host.neon.tech/dbname?sslmode=verify-full');
  assert.equal(new URL(url).searchParams.get('sslmode'), 'verify-full');
});
