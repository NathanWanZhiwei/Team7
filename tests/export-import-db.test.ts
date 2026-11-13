import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

test('import remaps IDs, preserves relationships, isolates users, rolls back and imports 500 todos under 5s', () => {
  const directory = mkdtempSync(join(tmpdir(), 'todo-import-'));
  const databaseModule = pathToFileURL(resolve('lib', 'db.ts')).href;
  const exportModule = pathToFileURL(resolve('lib', 'export-import.ts')).href;
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
      const { userDB, todoDB, tagDB, subtaskDB } = await import(${JSON.stringify(databaseModule)});
      const { toExportPayload } = await import(${JSON.stringify(exportModule)});
      const owner = userDB.create('owner', Buffer.from('owner'));
      const target = userDB.create('target', Buffer.from('target'));
      const existing = tagDB.create(target.id, { name: 'work', color: '#abcdef' });
      const work = tagDB.create(owner.id, { name: 'Work', color: '#123456' });
      const fresh = tagDB.create(owner.id, { name: 'Fresh', color: '#654321' });
      const source = todoDB.create(owner.id, {
        title: 'Original', due_date: '2024-02-29T09:30:00.000+08:00', priority: 'high',
        is_recurring: true, recurrence_pattern: 'yearly', reminder_minutes: 15,
        tag_ids: [work.id, fresh.id],
      });
      todoDB.updateForUser(source.id, owner.id, { completed: true });
      const first = subtaskDB.create(source.id, { title: 'First' });
      subtaskDB.updateForUser(first.id, owner.id, { completed: true });
      subtaskDB.create(source.id, { title: 'Second' });
      const items = toExportPayload(todoDB.findAllByUser(owner.id)).todos;
      items[0].subtasks[0].position = 99;
      items[0].subtasks[1].position = 99;
      assert.deepEqual(todoDB.importAll(target.id, items), { imported: 1, tagsCreated: 1, tagsReused: 1 });
      let restored = todoDB.findAllByUser(target.id)[0];
      assert.notEqual(restored.id, source.id);
      assert.equal(restored.completed, true);
      for (const field of ['title','due_date','priority','is_recurring','recurrence_pattern','reminder_minutes','created_at']) {
        assert.equal(restored[field], items[0][field]);
      }
      assert.equal(restored.last_notification_sent, null);
      assert.deepEqual(restored.subtasks.map(s => [s.title, s.completed, s.position, s.todo_id]),
        [['First', true, 0, restored.id], ['Second', false, 1, restored.id]]);
      assert.notEqual(restored.subtasks[0].id, first.id);
      assert.equal(restored.tags.find(t => t.name === 'work').id, existing.id);
      assert.equal(restored.tags.find(t => t.name === 'work').color, '#abcdef');
      assert.notEqual(restored.tags.find(t => t.name === 'Fresh').id, fresh.id);
      assert.equal(todoDB.findAllByUser(owner.id).length, 1);
      assert.deepEqual(todoDB.importAll(target.id, items), { imported: 1, tagsCreated: 0, tagsReused: 2 });
      assert.equal(todoDB.findAllByUser(target.id).length, 2);
      assert.equal(tagDB.findAllByUser(target.id).length, 2);
      assert.deepEqual(todoDB.importAll(target.id, []), { imported: 0, tagsCreated: 0, tagsReused: 0 });

      const connection = new Database('todos.db');
      connection.exec(\`CREATE TRIGGER fail_import BEFORE INSERT ON todos
        WHEN NEW.title = 'Fail' BEGIN SELECT RAISE(ABORT, 'Import failure'); END\`);
      const counts = () => ['todos','subtasks','tags','todo_tags'].map(table =>
        connection.prepare('SELECT count(*) AS count FROM ' + table).get().count);
      const before = counts();
      assert.throws(() => todoDB.importAll(target.id, [
        { ...items[0], tags: [{ name: 'Rollback tag', color: '#123456' }] },
        { ...items[0], title: 'Fail' },
      ]), /Import failure/);
      assert.deepEqual(counts(), before);
      const batch = Array.from({ length: 500 }, (_, i) => ({ ...items[0], title: 'Batch ' + i }));
      const start = performance.now();
      assert.equal(todoDB.importAll(target.id, batch).imported, 500);
      assert.ok(performance.now() - start < 5000, '500-todo import must take under 5 seconds');
      const after = todoDB.findAllByUser(target.id);
      assert.equal(after.length, 502);
      assert.ok(after.every(t => t.subtasks.length === 2 && t.tags.length === 2));
      assert.deepEqual(connection.pragma('foreign_key_check'), []);
      connection.close();
    `], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    for (const file of readdirSync(directory)) rmSync(join(directory, file));
    rmdirSync(directory);
  }
});
