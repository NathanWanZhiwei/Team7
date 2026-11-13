import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('todo edits clear sent reminder state only when reminder settings change', () => {
  const databaseDirectory = mkdtempSync(join(tmpdir(), 'todo-reminder-db-'));
  const serverOnlyDirectory = join(databaseDirectory, 'node_modules', 'server-only');
  const script = `
    import assert from 'node:assert/strict';
    process.chdir(process.env.TEST_DATABASE_DIRECTORY);
    const { todoDB, userDB } = await import(process.env.TEST_DATABASE_MODULE);
    const user = userDB.create('reminder_owner', Buffer.from('reminder_owner'));
    const todo = todoDB.create(user.id, {
      title: 'Reminder',
      due_date: '2026-03-01T00:30:00.000+08:00',
      reminder_minutes: 60,
    });
    const sentAt = '2026-02-28T15:00:00.000Z';

    todoDB.updateForUser(todo.id, user.id, { last_notification_sent: sentAt });
    todoDB.updateForUser(todo.id, user.id, { title: 'Renamed' });
    assert.equal(todoDB.findByIdForUser(todo.id, user.id).last_notification_sent, sentAt);

    todoDB.updateForUser(todo.id, user.id, {
      due_date: '2026-03-01T02:00:00.000+08:00',
    });
    assert.equal(todoDB.findByIdForUser(todo.id, user.id).last_notification_sent, null);

    todoDB.updateForUser(todo.id, user.id, { last_notification_sent: sentAt });
    todoDB.updateForUser(todo.id, user.id, { reminder_minutes: 30 });
    assert.equal(todoDB.findByIdForUser(todo.id, user.id).last_notification_sent, null);
  `;

  try {
    mkdirSync(serverOnlyDirectory, { recursive: true });
    writeFileSync(join(serverOnlyDirectory, 'index.js'), '');
    const result = spawnSync(
      process.execPath,
      ['--conditions=react-server', '--import=tsx', '--input-type=module', '-e', script],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_PATH: join(databaseDirectory, 'node_modules'),
          TEST_DATABASE_DIRECTORY: databaseDirectory,
          TEST_DATABASE_MODULE: pathToFileURL(resolve(projectRoot, 'lib/db.ts')).href,
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(databaseDirectory, { recursive: true, force: true });
  }
});
