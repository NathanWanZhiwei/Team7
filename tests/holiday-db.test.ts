import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

test('holiday seeds are idempotent and scoped queries include exactly the visible calendar dates', () => {
  const directory = mkdtempSync(join(tmpdir(), 'todo-holidays-'));
  const databaseModule = pathToFileURL(resolve('lib', 'db.ts')).href;
  const holidaysModule = pathToFileURL(resolve('lib', 'holidays.ts')).href;
  const serverMarker = pathToFileURL(resolve('node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js')).href;
  try {
    const result = spawnSync(process.execPath, ['--import=tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      import Database from 'better-sqlite3';
      registerHooks({ resolve(specifier, context, next) {
        return specifier === 'server-only'
          ? { url: ${JSON.stringify(serverMarker)}, shortCircuit: true }
          : next(specifier, context);
      }});
      process.chdir(${JSON.stringify(directory)});
      const { holidayDB } = await import(${JSON.stringify(databaseModule)});
      const { seedHolidays } = await import(${JSON.stringify(holidaysModule)});
      const db = new Database('todos.db');
      const all = holidayDB.findAll();
      assert.ok(all.some(h => h.date === '2026-01-01' && h.name === "New Year's Day"));
      assert.ok(all.some(h => h.date === '2027-02-08' && h.name.includes('in lieu')));
      assert.equal(new Set(all.map(h => h.date)).size, all.length);
      assert.equal(seedHolidays(db), 0);
      assert.equal(holidayDB.findAll().length, all.length);
      db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?)').run('2027-01-09', 'Grid boundary');
      db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?)').run('2027-01-10', 'Outside grid');
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        const scoped = holidayDB.findByMonth(2026, 12);
        assert.ok(scoped.some(h => h.date === '2027-01-01'));
        assert.ok(scoped.some(h => h.date === '2027-01-09'));
        assert.ok(!scoped.some(h => h.date === '2027-01-10'));
        assert.ok(scoped.every(h => h.date >= '2026-11-29' && h.date <= '2027-01-09'));
      }
      assert.ok((performance.now() - start) / 10 < 100);
      assert.deepEqual(holidayDB.findByMonth(2040, 1), []);
      db.close();
    `], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    for (const file of readdirSync(directory)) rmSync(join(directory, file));
    rmdirSync(directory);
  }
});
