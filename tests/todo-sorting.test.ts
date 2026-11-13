import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Todo } from '../lib/db';
import { sectionTodos, sortTodos } from '../lib/todo-sorting';

function todo(
  id: number,
  priority: Todo['priority'],
  due_date: string | null,
  created_at = '2026-01-01T00:00:00.000Z',
  completed = false,
  updated_at: string | null = null,
): Todo {
  return {
    id,
    user_id: 1,
    title: `Todo ${id}`,
    completed,
    due_date,
    priority,
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at,
    updated_at,
  };
}

test('sorts incomplete todos by priority, due date, then newest creation time', () => {
  const todos = [
    todo(1, 'low', null),
    todo(2, 'medium', '2026-01-02T09:00:00.000+08:00'),
    todo(3, 'high', '2026-01-02T09:00:00.000+08:00'),
    todo(4, 'high', '2026-01-01T09:00:00.000+08:00'),
    todo(5, 'medium', '2026-01-02T09:00:00.000+08:00', '2026-01-02T00:00:00.000Z'),
  ];

  assert.deepEqual(sortTodos(todos).map(({ id }) => id), [4, 3, 5, 2, 1]);
  assert.deepEqual(todos.map(({ id }) => id), [1, 2, 3, 4, 5]);
});

test('sections at the due-time boundary and sorts completed by latest update', () => {
  const now = new Date('2026-01-02T01:00:00.000Z');
  const todos = [
    todo(1, 'medium', '2026-01-02T08:59:59.999+08:00'),
    todo(2, 'medium', '2026-01-02T09:00:00.000+08:00'),
    todo(3, 'low', null),
    todo(4, 'high', null, '2026-01-01T00:00:00.000Z', true, '2026-01-02T00:00:00.000Z'),
    todo(5, 'high', null, '2026-01-01T00:00:00.000Z', true, '2026-01-02T00:30:00.000Z'),
  ];

  const sections = sectionTodos(todos, now);
  assert.deepEqual(sections.overdue.map(({ id }) => id), [1]);
  assert.deepEqual(sections.pending.map(({ id }) => id), [2, 3]);
  assert.deepEqual(sections.completed.map(({ id }) => id), [5, 4]);
});
