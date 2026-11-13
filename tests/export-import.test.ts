import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  exportFilename,
  importSchema,
  toCsv,
  toExportPayload,
} from '../lib/export-import';
import type { Todo } from '../lib/db';

const todo: Todo = {
  id: 42, user_id: 7, title: 'Buy milk, eggs, "bread"\nand tea',
  completed: true, due_date: '2024-02-29T09:30:00.000+08:00',
  priority: 'high', is_recurring: true, recurrence_pattern: 'yearly',
  reminder_minutes: 15, last_notification_sent: '2024-02-29T09:00:00+08:00',
  created_at: '2024-01-01 01:00:00', updated_at: '2024-02-01 01:00:00',
  subtasks: [{ id: 9, todo_id: 42, title: 'First', completed: true, position: 4, created_at: '2024-01-01' }],
  tags: [{ id: 3, user_id: 7, name: 'Work', color: '#123456', created_at: '2024-01-01' }],
};

test('JSON export is versioned, nested and excludes internal IDs and notification state', () => {
  const payload = toExportPayload([todo], new Date('2026-01-01T16:30:00Z'));
  assert.equal(payload.exported_at, '2026-01-02T00:30:00.000+08:00');
  assert.deepEqual(Object.keys(payload).sort(), ['exported_at', 'todos', 'version']);
  const item = payload.todos[0];
  assert.equal(item.title, todo.title);
  for (const key of ['id', 'user_id', 'updated_at', 'last_notification_sent']) {
    assert.equal(key in item, false);
  }
  assert.deepEqual(item.subtasks, [{ title: 'First', completed: true, position: 4 }]);
  assert.deepEqual(item.tags, [{ name: 'Work', color: '#123456' }]);
  assert.equal(importSchema.safeParse(payload).success, true);
  assert.equal(importSchema.safeParse(toExportPayload([])).success, true);
});

test('import validates required fields, types, enums and linked configuration without rejecting past dates', () => {
  const payload = toExportPayload([todo]);
  assert.equal(importSchema.safeParse(payload).success, true);
  for (const patch of [
    { title: '' }, { title: '   ' }, { completed: 1 }, { priority: 'urgent' },
    { due_date: '2024-02-30T09:00:00+08:00' }, { recurrence_pattern: 'hourly' },
    { due_date: null }, { reminder_minutes: 2 }, { reminder_minutes: 15.5 },
    { subtasks: [{ title: 'First', completed: false }] },
    { tags: [{ name: 'Work', color: 'red' }] }, { tags: [{ name: ' ', color: '#123456' }] },
  ]) {
    assert.equal(importSchema.safeParse({ ...payload, todos: [{ ...payload.todos[0], ...patch }] }).success, false,
      JSON.stringify(patch));
  }
  const { title: _title, ...missingTitle } = payload.todos[0];
  assert.equal(importSchema.safeParse({ ...payload, todos: [missingTitle] }).success, false);
  for (const invalid of [null, [], {}, { ...payload, version: 2 }, { ...payload, todos: null }]) {
    assert.equal(importSchema.safeParse(invalid).success, false);
  }
});

test('CSV uses fixed columns, CRLF records and RFC 4180 quoting', () => {
  assert.equal(toCsv([todo]),
    'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder\r\n' +
    '42,"Buy milk, eggs, ""bread""\nand tea",true,2024-02-29T09:30:00.000+08:00,high,true,yearly,15\r\n');
  assert.equal(toCsv([]), 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder\r\n');
  assert.match(toCsv([{ ...todo, title: '=HYPERLINK("https://example.test")' }]), /'=HYPERLINK/);
});

test('export filenames use Singapore calendar date across UTC midnight boundary', () => {
  const instant = new Date('2026-12-31T16:00:00Z');
  assert.equal(exportFilename('json', instant), 'todos-2027-01-01.json');
  assert.equal(exportFilename('csv', instant), 'todos-2027-01-01.csv');
});
