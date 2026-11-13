import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('subtask persistence is ordered, user-scoped, independent, and cascades', () => {
  const databaseDirectory = mkdtempSync(join(tmpdir(), 'todo-subtask-db-'));
  const testNodeModules = join(databaseDirectory, 'node_modules');
  const serverOnlyDirectory = join(testNodeModules, 'server-only');
  const script = `
    import assert from 'node:assert/strict';
    process.chdir(process.env.TEST_DATABASE_DIRECTORY);
    const { subtaskDB, todoDB, userDB } = await import(process.env.TEST_DATABASE_MODULE);

    const owner = userDB.create('subtask_owner', Buffer.from('subtask_owner'));
    const otherUser = userDB.create('subtask_other', Buffer.from('subtask_other'));
    const todo = todoDB.create(owner.id, { title: 'Checklist' });
    const first = subtaskDB.create(todo.id, { title: 'First' });
    const second = subtaskDB.create(todo.id, { title: 'Second' });

    assert.deepEqual(
      subtaskDB.findByTodoId(todo.id).map(({ position }) => position),
      [0, 1],
    );
    assert.deepEqual(
      todoDB.findByIdForUser(todo.id, owner.id).subtasks.map(({ id }) => id),
      [first.id, second.id],
    );

    assert.equal(subtaskDB.findByIdForUser(first.id, otherUser.id), undefined);
    assert.equal(
      subtaskDB.updateForUser(first.id, otherUser.id, { completed: true }),
      undefined,
    );
    assert.equal(subtaskDB.deleteForUser(first.id, otherUser.id), false);

    assert.equal(subtaskDB.updateForUser(first.id, owner.id, { completed: true }).completed, true);
    todoDB.updateForUser(todo.id, owner.id, { completed: true });
    todoDB.updateForUser(todo.id, owner.id, { completed: false });
    assert.equal(subtaskDB.findByIdForUser(first.id, owner.id).completed, true);

    assert.equal(subtaskDB.deleteForUser(first.id, owner.id), true);
    const third = subtaskDB.create(todo.id, { title: 'Third' });
    assert.deepEqual(
      subtaskDB.findByTodoId(todo.id).map(({ position }) => position),
      [1, 2],
    );

    assert.equal(todoDB.deleteForUser(todo.id, owner.id), true);
    assert.deepEqual(subtaskDB.findByTodoId(todo.id), []);
    assert.equal(subtaskDB.findByIdForUser(third.id, owner.id), undefined);
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
          NODE_PATH: testNodeModules,
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
