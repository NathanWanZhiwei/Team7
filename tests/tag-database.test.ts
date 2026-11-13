import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

test('tag persistence enforces ownership, idempotency, live updates, atomic writes and cascades', () => {
  const directory = mkdtempSync(join(tmpdir(), 'todo-tags-'));
  const databaseModule = pathToFileURL(resolve('lib', 'db.ts')).href;
  const serverMarker = pathToFileURL(resolve('node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js')).href;
  try {
    // Next supplies this marker at build time; the test process supplies only that marker.
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
      const { userDB, todoDB, tagDB, TagNotFoundError } = await import(${JSON.stringify(databaseModule)});
      const first = userDB.create('first', Buffer.from('first'));
      const second = userDB.create('second', Buffer.from('second'));
      const work = tagDB.create(first.id, { name: 'Work' });
      const other = tagDB.create(second.id, { name: 'Work' });
      const urgent = tagDB.create(first.id, { name: 'Urgent', color: '#ff0000' });
      assert.equal(work.color, '#3B82F6');
      assert.throws(() => tagDB.create(first.id, { name: 'Work' }), /UNIQUE/);
      assert.throws(() => tagDB.update(urgent.id, first.id, { name: 'Work' }), /UNIQUE/);
      assert.deepEqual(tagDB.findAllByUser(second.id).map(t => t.id), [other.id]);
      assert.equal(tagDB.findById(work.id, second.id), undefined);
      assert.equal(tagDB.update(work.id, second.id, { name: 'Stolen' }), undefined);
      assert.equal(tagDB.delete(work.id, second.id), false);
      const todo = todoDB.create(first.id, { title: 'Plan', tag_ids: [work.id, urgent.id] });
      const foreign = todoDB.create(second.id, { title: 'Private' });
      assert.equal(todo.tags.length, 2);
      tagDB.attachToTodo(todo.id, work.id, first.id);
      tagDB.attachToTodo(todo.id, work.id, first.id);
      assert.equal(tagDB.findByTodoId(todo.id, first.id).length, 2);
      assert.deepEqual(tagDB.findByTodoId(todo.id, second.id), []);
      for (const [todoId, tagId, userId] of [
        [todo.id, other.id, first.id], [foreign.id, work.id, first.id],
        [todo.id, work.id, second.id], [todo.id, 99999, first.id]
      ]) {
        assert.throws(() => tagDB.attachToTodo(todoId, tagId, userId), TagNotFoundError);
        assert.throws(() => tagDB.detachFromTodo(todoId, tagId, userId), TagNotFoundError);
      }
      tagDB.update(work.id, first.id, { name: 'Office', color: '#123456' });
      assert.equal(todoDB.findByIdForUser(todo.id, first.id).tags.find(t => t.id === work.id).name, 'Office');
      assert.throws(() => todoDB.create(first.id, { title: 'Rollback', tag_ids: [other.id] }), TagNotFoundError);
      assert.equal(todoDB.findAllByUser(first.id).length, 1);
      assert.throws(() => todoDB.updateForUser(todo.id, first.id, {
        title: 'Must not change', tag_ids: [urgent.id, other.id]
      }), TagNotFoundError);
      assert.equal(todoDB.findByIdForUser(todo.id, first.id).title, 'Plan');
      assert.equal(todoDB.findByIdForUser(todo.id, first.id).tags.length, 2);
      tagDB.detachFromTodo(todo.id, work.id, first.id);
      tagDB.detachFromTodo(todo.id, work.id, first.id);
      assert.equal(tagDB.findByTodoId(todo.id, first.id).length, 1);
      todoDB.updateForUser(todo.id, first.id, { tag_ids: [] });
      assert.equal(todoDB.findByIdForUser(todo.id, first.id).tags.length, 0);
      tagDB.attachToTodo(todo.id, urgent.id, first.id);
      for (let i = 0; i < 55; i++) todoDB.create(first.id, { title: 'Cascade', tag_ids: [urgent.id] });
      tagDB.delete(urgent.id, first.id);
      assert.ok(todoDB.findAllByUser(first.id).every(t => t.tags.length === 0));
      tagDB.attachToTodo(foreign.id, other.id, second.id);
      todoDB.deleteForUser(foreign.id, second.id);
      const connection = new Database('todos.db');
      assert.deepEqual(connection.pragma('foreign_key_check'), []);
      assert.equal(connection.prepare('SELECT count(*) AS count FROM todo_tags').get().count, 0);
      connection.close();
    `], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    for (const file of readdirSync(directory)) rmSync(join(directory, file));
    rmdirSync(directory);
  }
});
