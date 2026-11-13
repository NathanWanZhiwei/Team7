import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import Database from 'better-sqlite3';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('stale reminder acknowledgments cannot suppress a rearmed reminder', () => {
  const directory = mkdtempSync(join(tmpdir(), 'reminder-ack-'));
  try {
    const existing = new Database(join(directory, 'todos.db'));
    existing.exec(`
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, due_date TEXT, priority TEXT DEFAULT 'medium',
        is_recurring INTEGER NOT NULL DEFAULT 0, recurrence_pattern TEXT,
        reminder_minutes INTEGER, last_notification_sent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      );
      INSERT INTO todos (id, user_id, title) VALUES (500, 999, 'existing todo');
    `);
    existing.close();
    mkdirSync(join(directory, 'node_modules', 'server-only'), { recursive: true });
    writeFileSync(join(directory, 'node_modules', 'server-only', 'index.js'), '');
    const script = `
      import assert from 'node:assert/strict';
      import Database from 'better-sqlite3';
      process.chdir(process.env.TEST_DIR);
      const { todoDB, userDB } = await import(process.env.TEST_MODULE);
      const database = new Database('todos.db', { readonly: true });
      assert.deepEqual(
        database.prepare('SELECT title, reminder_revision FROM todos WHERE id = 500').get(),
        { title: 'existing todo', reminder_revision: 0 },
      );
      database.close();
      const owner = userDB.create('owner', Buffer.from('owner'));
      const other = userDB.create('other', Buffer.from('other'));
      const todo = todoDB.create(owner.id, {
        title: 'reminder', due_date: '2026-01-02T00:00:00.000+08:00', reminder_minutes: 60,
      });
      const now = new Date('2026-01-01T23:30:00+08:00');
      const revision = todoDB.findDueRemindersForUser(owner.id, now)[0].reminder_revision;
      assert.equal(todoDB.acknowledgeReminderForUser(todo.id, other.id, revision, now), false);
      todoDB.updateForUser(todo.id, owner.id, { reminder_minutes: 30 });
      todoDB.updateForUser(todo.id, owner.id, { reminder_minutes: 60 });
      assert.equal(todoDB.acknowledgeReminderForUser(todo.id, owner.id, revision, now), false);
      const current = todoDB.findDueRemindersForUser(owner.id, now)[0];
      assert.ok(current.reminder_revision > revision);
      assert.equal(todoDB.acknowledgeReminderForUser(todo.id, owner.id, current.reminder_revision, now), true);
      assert.equal(todoDB.findDueRemindersForUser(owner.id, now).length, 0);
    `;
    const result = spawnSync(process.execPath, [
      '--conditions=react-server', '--import=tsx', '--input-type=module', '-e', script,
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_PATH: join(directory, 'node_modules'),
        TEST_DIR: directory,
        TEST_MODULE: pathToFileURL(resolve(root, 'lib/db.ts')).href,
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
