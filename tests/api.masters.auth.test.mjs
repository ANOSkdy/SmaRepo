import { test, mock } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import Module from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const routeUrls = {
  sites: new URL('./dist/app/api/masters/sites/route.js', import.meta.url),
  machines: new URL('./dist/app/api/masters/machines/route.js', import.meta.url),
  workTypes: new URL('./dist/app/api/masters/work-types/route.js', import.meta.url),
};

let importCounter = 0;

const defaultAuth = async () => null;
const defaultQuery = async () => ({ rows: [], rowCount: 0 });
const defaultHasDatabaseUrl = () => true;

function resetMocks() {
  globalThis.__mastersAuthMock = defaultAuth;
  globalThis.__mastersQueryMock = defaultQuery;
  globalThis.__mastersHasDatabaseUrlMock = defaultHasDatabaseUrl;
}

resetMocks();

async function importRoute(kind, overrides = {}) {
  resetMocks();
  if (overrides.auth) globalThis.__mastersAuthMock = overrides.auth;
  if (overrides.query) globalThis.__mastersQueryMock = overrides.query;
  if (overrides.hasDatabaseUrl) globalThis.__mastersHasDatabaseUrlMock = overrides.hasDatabaseUrl;

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '@/lib/auth') {
      return { auth: (...args) => globalThis.__mastersAuthMock(...args) };
    }
    if (request === '@/lib/db') {
      return { query: (...args) => globalThis.__mastersQueryMock(...args) };
    }
    if (request === '@/lib/server-env') {
      return { hasDatabaseUrl: (...args) => globalThis.__mastersHasDatabaseUrlMock(...args) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return await import(`${routeUrls[kind].href}?v=${importCounter++}`);
  } finally {
    Module._load = originalLoad;
  }
}

for (const [kind, path] of [
  ['sites', '/api/masters/sites'],
  ['machines', '/api/masters/machines'],
  ['workTypes', '/api/masters/work-types'],
]) {
  test(`${path} returns 401 when unauthenticated`, async () => {
    const queryMock = mock.fn(async () => ({ rows: [{ id: '1', fields: {} }], rowCount: 1 }));
    const { GET } = await importRoute(kind, {
      auth: mock.fn(async () => null),
      query: queryMock,
      hasDatabaseUrl: () => true,
    });

    const response = await GET(new Request(`https://example.com${path}`));
    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), { error: 'UNAUTHORIZED' });
    assert.strictEqual(queryMock.mock.calls.length, 0);
  });

  test(`${path} returns 200 and preserves response shape when authenticated`, async () => {
    const rows = [{ id: 'rec-1', fields: { name: 'A' } }];
    const queryMock = mock.fn(async () => ({ rows, rowCount: 1 }));

    const { GET } = await importRoute(kind, {
      auth: mock.fn(async () => ({ user: { id: 'user-1' } })),
      query: queryMock,
      hasDatabaseUrl: () => true,
    });

    const response = await GET(new Request(`https://example.com${path}`));
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), rows);
    assert.strictEqual(queryMock.mock.calls.length, 1);
  });
}
