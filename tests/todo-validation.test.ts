import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeDueDate,
  validateCreateTodo,
  validateUpdateTodo,
} from '../lib/todo-validation';

function getError<T>(result: { value: T } | { error: string }): string | undefined {
  return 'error' in result ? result.error : undefined;
}

test('create requires a non-empty trimmed title and defaults other fields', () => {
  assert.deepEqual(validateCreateTodo({ title: '  Plan  ' }), {
    value: { title: 'Plan' },
  });
  assert.equal(getError(validateCreateTodo({ title: '   ' })), 'Title is required');
  assert.equal(getError(validateCreateTodo({ title: 'Plan', due_date: null })), undefined);
  assert.match(
    getError(validateCreateTodo({ title: 'Plan', completed: true })) ?? '',
    /Unknown field/,
  );
});

test('create accepts a due date at least one minute ahead and rejects an earlier one', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(
    getError(validateCreateTodo({ title: 'Plan', due_date: '2026-01-01T08:01:00' }, now)),
    undefined,
  );
  assert.equal(
    getError(validateCreateTodo({ title: 'Plan', due_date: '2026-01-01T08:00:59' }, now)),
    'Due date must be at least 1 minute in the future',
  );
});

test('due dates are interpreted and stored in Singapore time', () => {
  assert.deepEqual(normalizeDueDate('2026-01-01T09:30'), {
    value: '2026-01-01T09:30:00.000+08:00',
  });
  assert.deepEqual(normalizeDueDate('2026-01-01T01:30:00Z'), {
    value: '2026-01-01T09:30:00.000+08:00',
  });
  assert.equal(
    getError(normalizeDueDate('2026-02-30T09:30')),
    'Due date must be a valid ISO 8601 date-time',
  );
});

test('updates allow partial fields but reject invalid or empty updates', () => {
  assert.deepEqual(validateUpdateTodo({ completed: true }), { value: { completed: true } });
  assert.equal(getError(validateUpdateTodo({ title: '  ' })), 'Title cannot be empty');
  assert.equal(getError(validateUpdateTodo({})), 'At least one field is required');
});
