import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

test('template persistence is user-scoped and creates independent todos atomically', () => {
  const directory = mkdtempSync(join(tmpdir(), 'todo-templates-'));
  const databaseModule = pathToFileURL(resolve('lib', 'db.ts')).href;
  const serverMarker = pathToFileURL(
    resolve('node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js'),
  ).href;
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
      const { userDB, todoDB, tagDB, templateDB } = await import(${JSON.stringify(databaseModule)});
      const owner = userDB.create('template_owner', Buffer.from('template_owner'));
      const stranger = userDB.create('template_stranger', Buffer.from('template_stranger'));
      const tag = tagDB.create(owner.id, { name: 'Fresh each time' });
      const template = templateDB.create(owner.id, {
        name: 'Weekly review',
        title_template: 'Review the week',
        priority: 'high',
        is_recurring: true,
        recurrence_pattern: 'weekly',
        reminder_minutes: 30,
        due_date_offset_minutes: 60,
        subtasks: [
          { title: 'Collect notes', position: 0 },
          { title: 'Share summary', position: 1 },
        ],
      });
      assert.equal(templateDB.findAllByUser(owner.id).length, 1);
      assert.deepEqual(templateDB.findAllByUser(stranger.id), []);
      assert.equal(templateDB.findByIdForUser(template.id, stranger.id), undefined);
      assert.equal(templateDB.createTodoForUser(template.id, stranger.id), undefined);
      assert.equal(templateDB.deleteForUser(template.id, stranger.id), false);

      const now = new Date('2025-12-31T23:30:00.000Z');
      const created = templateDB.createTodoForUser(template.id, owner.id, now);
      assert.equal(created.title, 'Review the week');
      assert.equal(created.priority, 'high');
      assert.equal(created.due_date, '2026-01-01T08:30:00.000+08:00');
      assert.equal(created.is_recurring, true);
      assert.equal(created.recurrence_pattern, 'weekly');
      assert.equal(created.reminder_minutes, 30);
      assert.deepEqual(created.tags, []);
      assert.deepEqual(created.subtasks.map(({ title, position, completed }) => ({
        title, position, completed,
      })), [
        { title: 'Collect notes', position: 0, completed: false },
        { title: 'Share summary', position: 1, completed: false },
      ]);

      const noChecklist = templateDB.create(owner.id, {
        name: 'No checklist',
        title_template: 'No checklist',
      });
      const emptyUse = templateDB.createTodoForUser(noChecklist.id, owner.id, now);
      assert.deepEqual(emptyUse.subtasks, []);
      const connection = new Database('todos.db');
      connection.prepare('UPDATE templates SET subtasks_json = ? WHERE id = ?').run('{', noChecklist.id);
      connection.close();
      const malformedUse = templateDB.createTodoForUser(noChecklist.id, owner.id, now);
      assert.deepEqual(malformedUse.subtasks, []);
      assert.deepEqual(malformedUse.tags, []);

      assert.equal(templateDB.deleteForUser(template.id, owner.id), true);
      assert.equal(templateDB.findByIdForUser(template.id, owner.id), undefined);
      assert.equal(todoDB.findByIdForUser(created.id, owner.id).title, 'Review the week');
      assert.equal(tagDB.findByTodoId(created.id, owner.id).some((item) => item.id === tag.id), false);
    `], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
