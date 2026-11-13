import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('rate limits persist, isolate subjects, and return a retry delay', () => {
  const directory = mkdtempSync(join(tmpdir(), 'todo-rate-limit-'));
  const modules = join(directory, 'node_modules');
  const script = `
    import assert from 'node:assert/strict';
    import { createHmac } from 'node:crypto';
    import Database from 'better-sqlite3';
    import { NextRequest } from 'next/server.js';

    process.chdir(process.env.TEST_DATABASE_DIRECTORY);
    const { checkApiRateLimit } = await import(process.env.TEST_LIMIT_MODULE);
    const request = new NextRequest('http://localhost/api/todos', {
      headers: { 'x-real-ip': '192.0.2.1' },
    });
    const now = 600001;

    for (let i = 0; i < 10; i++) {
      assert.equal(checkApiRateLimit(request, 'write', undefined, now), null);
    }
    const blocked = checkApiRateLimit(request, 'write', undefined, now);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '600');
    assert.equal(checkApiRateLimit(request, 'auth', undefined, 1200000), null);

    for (let i = 0; i < 120; i++) {
      assert.equal(checkApiRateLimit(request, 'read', 1, now), null);
    }
    assert.equal(checkApiRateLimit(request, 'read', 1, now).status, 429);
    assert.equal(checkApiRateLimit(request, 'read', 2, now), null);
    for (let i = 0; i < 60; i++) {
      assert.equal(checkApiRateLimit(request, 'write', 1, now), null);
    }
    assert.equal(checkApiRateLimit(request, 'write', 1, now).status, 429);

    const db = new Database('todos.db', { readonly: true });
    const rows = db.prepare('SELECT subject_hash FROM api_rate_limits').all();
    assert.ok(rows.length > 0);
    assert.ok(rows.every(({ subject_hash }) => /^[a-f0-9]{64}$/.test(subject_hash)));
    const expectedIpHash = createHmac('sha256', process.env.SESSION_SECRET)
      .update('ip:192.0.2.1').digest('hex');
    assert.ok(rows.some(({ subject_hash }) => subject_hash === expectedIpHash));
    db.close();
  `;

  try {
    mkdirSync(join(modules, 'server-only'), { recursive: true });
    writeFileSync(join(modules, 'server-only', 'index.js'), '');
    const result = spawnSync(
      process.execPath,
      ['--conditions=react-server', '--import=tsx', '--input-type=module', '-e', script],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_PATH: modules,
          SESSION_SECRET: 'test-secret-not-for-production-123456',
          TEST_DATABASE_DIRECTORY: directory,
          TEST_LIMIT_MODULE: pathToFileURL(resolve(projectRoot, 'lib/api-rate-limit.ts')).href,
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
