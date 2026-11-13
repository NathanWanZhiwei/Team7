import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { test } from 'node:test';
import {
  hasReminderConfigurationChanged,
  isReminderMinutes,
  REMINDER_LABELS,
  REMINDER_OPTIONS,
} from '../lib/reminder-options';
import { DUE_REMINDERS_QUERY } from '../lib/reminder-query';
import { formatSingaporeDateTime } from '../lib/timezone';
import {
  validateCreateTodo,
  validateUpdateTodo,
  type ValidationResult,
} from '../lib/todo-validation';

function getValue<T>(result: ValidationResult<T>): T {
  if ('error' in result) throw new Error(result.error);
  return result.value;
}

function getError<T>(result: ValidationResult<T>): string {
  if ('value' in result) throw new Error('Expected validation to fail');
  return result.error;
}

test('reminder options expose exactly the seven supported offsets and labels', () => {
  assert.deepEqual(
    REMINDER_OPTIONS.map(({ minutes }) => minutes),
    [15, 30, 60, 120, 1440, 2880, 10080],
  );
  assert.deepEqual(REMINDER_LABELS, {
    15: '15m',
    30: '30m',
    60: '1h',
    120: '2h',
    1440: '1d',
    2880: '2d',
    10080: '1w',
  });
  assert.equal(isReminderMinutes(60), true);
  assert.equal(isReminderMinutes(45), false);
});

test('reminder validation accepts presets and rejects unsupported values or missing due dates', () => {
  for (const { minutes } of REMINDER_OPTIONS) {
    assert.deepEqual(
      getValue(validateCreateTodo(
        {
          title: 'Plan',
          due_date: '2026-01-02T09:00:00+08:00',
          reminder_minutes: minutes,
        },
        Date.UTC(2026, 0, 1),
      )),
      {
        title: 'Plan',
        priority: 'medium',
        due_date: '2026-01-02T09:00:00.000+08:00',
        reminder_minutes: minutes,
      },
    );
    assert.deepEqual(validateUpdateTodo({ reminder_minutes: minutes }), {
      value: { reminder_minutes: minutes },
    });
  }
  assert.match(getError(validateCreateTodo({ title: 'Plan', reminder_minutes: 45 })), /reminder_minutes/);
  assert.match(
    getError(validateCreateTodo({ title: 'Plan', reminder_minutes: 60 })),
    /due date/i,
  );
  assert.match(getError(validateUpdateTodo({ reminder_minutes: 45 })), /reminder_minutes/);
  assert.match(
    getError(validateUpdateTodo({ last_notification_sent: 'not-a-date' })),
    /last_notification_sent/,
  );
});

test('reminder edits re-arm only when the due date or offset actually changes', () => {
  const current = {
    due_date: '2026-01-02T09:00:00.000+08:00',
    reminder_minutes: 60,
  };
  assert.equal(
    hasReminderConfigurationChanged(current, { due_date: current.due_date }),
    false,
  );
  assert.equal(
    hasReminderConfigurationChanged(current, { reminder_minutes: 60 }),
    false,
  );
  assert.equal(
    hasReminderConfigurationChanged(current, { due_date: null }),
    true,
  );
  assert.equal(
    hasReminderConfigurationChanged(current, { reminder_minutes: 30 }),
    true,
  );
});

test('reminder query timestamps are formatted with Singapore offset', () => {
  assert.equal(
    formatSingaporeDateTime(new Date('2026-01-01T16:05:06.007Z')),
    '2026-01-02T00:05:06.007+08:00',
  );
});

test('due reminder query includes the exact trigger boundary in Singapore time', () => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL,
      due_date TEXT,
      priority TEXT NOT NULL,
      is_recurring INTEGER NOT NULL,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      last_notification_sent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  const insertTodo = database.prepare(`
    INSERT INTO todos (
      id, user_id, title, completed, due_date, priority, is_recurring,
      recurrence_pattern, reminder_minutes, last_notification_sent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const dueDate = '2026-01-02T00:05:00.000+08:00';
  const trigger = Date.parse(dueDate) - 60 * 60_000;
  insertTodo.run(1, 7, 'Boundary', 0, dueDate, 'medium', 0, null, 60, null, '2026-01-01');
  insertTodo.run(2, 7, 'Already sent', 0, dueDate, 'medium', 0, null, 60, '2026-01-01', '2026-01-01');
  insertTodo.run(3, 7, 'Completed', 1, dueDate, 'medium', 0, null, 60, null, '2026-01-01');
  insertTodo.run(4, 8, 'Other user', 0, dueDate, 'medium', 0, null, 60, null, '2026-01-01');
  insertTodo.run(5, 7, 'No reminder', 0, dueDate, 'medium', 0, null, null, null, '2026-01-01');

  const query = database.prepare(DUE_REMINDERS_QUERY);
  const atBoundary = query.all(7, formatSingaporeDateTime(new Date(trigger))) as { id: number }[];
  const beforeBoundary = query.all(7, formatSingaporeDateTime(new Date(trigger - 1))) as { id: number }[];
  const afterBoundary = query.all(7, formatSingaporeDateTime(new Date(trigger + 1))) as { id: number }[];

  assert.deepEqual(atBoundary.map(({ id }) => id), [1]);
  assert.deepEqual(beforeBoundary, []);
  assert.deepEqual(afterBoundary.map(({ id }) => id), [1]);
  database.close();
});

test('due reminder query handles all offsets across a Singapore date boundary', () => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL,
      is_recurring INTEGER NOT NULL,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER NOT NULL,
      last_notification_sent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  const dueDate = '2026-01-02T00:05:00.000+08:00';
  const insertTodo = database.prepare(`
    INSERT INTO todos (
      id, user_id, title, completed, due_date, priority, is_recurring,
      recurrence_pattern, reminder_minutes, created_at
    ) VALUES (?, 7, ?, 0, ?, 'medium', 0, NULL, ?, '2026-01-01')
  `);
  const query = database.prepare(DUE_REMINDERS_QUERY);

  for (const { minutes } of REMINDER_OPTIONS) {
    database.exec('DELETE FROM todos');
    insertTodo.run(minutes, `${minutes} minute reminder`, dueDate, minutes);
    const trigger = Date.parse(dueDate) - minutes * 60_000;
    const due = query.all(7, formatSingaporeDateTime(new Date(trigger))) as { id: number }[];
    const early = query.all(7, formatSingaporeDateTime(new Date(trigger - 1))) as { id: number }[];
    assert.deepEqual(due.map(({ id }) => id), [minutes]);
    assert.deepEqual(early, []);
  }
  database.close();
});
