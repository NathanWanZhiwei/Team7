import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeDueDate,
  validateCreateTodo,
  validatePriority,
  validateUpdateTodo,
} from '../lib/todo-validation';

function getError<T>(result: { value: T } | { error: string }): string | undefined {
  return 'error' in result ? result.error : undefined;
}

test('create requires a non-empty trimmed title and defaults other fields', () => {
  assert.deepEqual(validateCreateTodo({ title: '  Plan  ' }), {
    value: { title: 'Plan', priority: 'medium' },
  });
  assert.equal(getError(validateCreateTodo({ title: '   ' })), 'Title is required');
  assert.equal(getError(validateCreateTodo({ title: 'Plan', due_date: null })), undefined);
  assert.match(
    getError(validateCreateTodo({ title: 'Plan', completed: true })) ?? '',
    /Unknown field/,
  );
  assert.deepEqual(validateCreateTodo({ title: 'Plan', priority: null }), {
    value: { title: 'Plan', priority: 'medium' },
  });
});

test('priority validation defaults only on create and rejects invalid values', () => {
  assert.deepEqual(validatePriority(undefined, true), { value: 'medium' });
  assert.deepEqual(validatePriority(null, true), { value: 'medium' });
  assert.deepEqual(validatePriority('high'), { value: 'high' });
  assert.equal(
    getError(validatePriority(null)),
    "Invalid priority: null. Must be 'high', 'medium', or 'low'.",
  );
  assert.equal(
    getError(validatePriority('urgent', true)),
    "Invalid priority: urgent. Must be 'high', 'medium', or 'low'.",
  );
  assert.equal(
    getError(validateUpdateTodo({ priority: null })),
    "Invalid priority: null. Must be 'high', 'medium', or 'low'.",
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

test('recurring todos require a due date and a valid cadence', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(
    getError(validateCreateTodo({ title: 'Habit', is_recurring: true, recurrence_pattern: 'daily' }, now)),
    'Recurring todos require a due date',
  );
  assert.equal(
    getError(
      validateCreateTodo(
        {
          title: 'Habit',
          due_date: '2026-01-01T09:00',
          is_recurring: true,
          recurrence_pattern: 'hourly',
        },
        now,
      ),
    ),
    'recurrence_pattern must be daily, weekly, monthly, yearly, or null',
  );
  assert.deepEqual(
    validateCreateTodo(
      {
        title: 'Habit',
        due_date: '2026-01-01T09:00',
        is_recurring: true,
        recurrence_pattern: 'daily',
      },
      now,
    ),
    {
      value: {
        title: 'Habit',
        due_date: '2026-01-01T09:00:00.000+08:00',
        priority: 'medium',
        is_recurring: true,
        recurrence_pattern: 'daily',
      },
    },
  );
});

test('recurrence updates validate the merged state and clear the cadence when disabled', () => {
  const current = {
    due_date: '2026-01-01T09:00:00.000+08:00',
    is_recurring: true,
    recurrence_pattern: 'weekly' as const,
  };
  assert.equal(
    getError(validateUpdateTodo({ due_date: null }, current)),
    'Recurring todos require a due date',
  );
  assert.deepEqual(validateUpdateTodo({ is_recurring: false, due_date: null }, current), {
    value: { is_recurring: false, due_date: null, recurrence_pattern: null },
  });
  assert.equal(
    getError(
      validateUpdateTodo(
        { is_recurring: true },
        { due_date: current.due_date, is_recurring: false, recurrence_pattern: null },
      ),
    ),
    'Invalid recurrence pattern',
  );
});
