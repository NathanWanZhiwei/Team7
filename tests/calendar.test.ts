import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatMonth,
  generateCalendarGrid,
  groupCalendarTodos,
  parseMonthParam,
  shiftMonth,
} from '../lib/calendar';
import type { Todo } from '../lib/db';

const now = new Date('2026-02-28T16:30:00Z');

test('calendar grids always have 42 Sunday-first cells with correct month boundaries', () => {
  for (const [year, month, days, start, end] of [
    [2025, 2, 28, '2025-01-26', '2025-03-08'],
    [2028, 2, 29, '2028-01-30', '2028-03-11'],
    [2026, 3, 31, '2026-03-01', '2026-04-11'],
    [2025, 3, 31, '2025-02-23', '2025-04-05'],
    [2026, 12, 31, '2026-11-29', '2027-01-09'],
    [2027, 1, 31, '2026-12-27', '2027-02-06'],
  ] as const) {
    const grid = generateCalendarGrid(year, month, now);
    assert.equal(grid.length, 42);
    assert.equal(grid[0].date, start);
    assert.equal(grid[41].date, end);
    assert.equal(grid.filter((day) => day.isCurrentMonth).length, days);
    assert.equal(new Set(grid.map((day) => day.date)).size, 42);
    grid.forEach((day, index) => {
      assert.equal(day.isWeekend, index % 7 === 0 || index % 7 === 6);
    });
  }
  assert.ok(generateCalendarGrid(2028, 2, now).some((day) => day.date === '2028-02-29' && day.isCurrentMonth));
});

test('today and past flags use Singapore date rather than UTC date', () => {
  const grid = generateCalendarGrid(2026, 2, now);
  assert.equal(grid.filter((day) => day.isToday).length, 1);
  assert.equal(grid.find((day) => day.isToday)?.date, '2026-03-01');
  assert.equal(grid.find((day) => day.date === '2026-02-28')?.isPast, true);
  assert.equal(grid.find((day) => day.date === '2026-03-01')?.isPast, false);
  assert.ok(generateCalendarGrid(2028, 2, now).every((day) => !day.isToday && !day.isPast));
});

test('month URLs and navigation cross year boundaries and reject malformed input without a blank calendar', () => {
  assert.deepEqual(parseMonthParam('2028-02', now), { year: 2028, month: 2 });
  for (const raw of [null, '', 'abc', '2026-13', '2026-00', '2026-1', '999999-12']) {
    assert.deepEqual(parseMonthParam(raw, now), { year: 2026, month: 3 });
  }
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 1, month: 1 }, -1), { year: 0, month: 12 });
  assert.equal(formatMonth({ year: 99, month: 3 }), '0099-03');
  assert.equal(formatMonth({ year: 10000, month: 1 }), '+010000-01');
  assert.deepEqual(parseMonthParam('+010000-01', now), { year: 10000, month: 1 });
  assert.deepEqual(parseMonthParam('-000001-01', now), { year: -1, month: 1 });
  for (const [year, month] of [[2026, 0], [2026, 13], [2026.5, 2], [Infinity, 2]]) {
    assert.throws(() => generateCalendarGrid(year, month, now), RangeError);
  }
  assert.equal(generateCalendarGrid(2026, 11).length, 42);
  assert.ok(parseMonthParam(null).month >= 1);
});

test('due todos group on Singapore dates, exclude undated todos, and sort by priority then time', () => {
  const base: Todo = {
    id: 1, user_id: 1, title: 'Due', completed: false, due_date: null,
    priority: 'medium', is_recurring: false, recurrence_pattern: null,
    reminder_minutes: null, last_notification_sent: null, created_at: '', updated_at: null,
  };
  const todos: Todo[] = [
    base,
    { ...base, id: 2, due_date: '2026-03-01T00:30:00.000+08:00' },
    { ...base, id: 3, priority: 'high', due_date: '2026-02-28T17:00:00Z' },
    { ...base, id: 4, priority: 'high', due_date: '2026-03-01T00:30' },
    { ...base, id: 5, priority: 'low', completed: true, due_date: '2026-03-01T15:00:00+08:00' },
    { ...base, id: 6, priority: 'high', due_date: '2026-03-01T00:30' },
  ];
  const grouped = groupCalendarTodos(todos);
  assert.equal(grouped.size, 1);
  assert.deepEqual(grouped.get('2026-03-01')?.map((todo) => todo.id), [4, 6, 3, 2, 5]);
  assert.equal(todos[0], base);
});
