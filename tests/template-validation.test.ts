import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Template } from '../lib/db';
import { validateCreateTemplate, validateUpdateTemplate } from '../lib/template-validation';

function errorOf<T>(result: { value: T } | { error: string }): string | undefined {
  return 'error' in result ? result.error : undefined;
}

const existing: Template = {
  id: 1,
  user_id: 1,
  name: 'Weekly review',
  description: null,
  category: 'Work',
  title_template: 'Review',
  priority: 'high',
  is_recurring: true,
  recurrence_pattern: 'weekly',
  reminder_minutes: 30,
  due_date_offset_minutes: 60,
  subtasks_json: null,
  created_at: '2026-01-01 00:00:00',
};

test('template creation trims labels, defaults settings, and canonicalizes checklist order', () => {
  assert.deepEqual(validateCreateTemplate({
    name: '  Weekly  ',
    title_template: '  Plan  ',
    subtasks: [
      { title: 'Second', position: 2 },
      { title: 'First', position: 1 },
    ],
  }), {
    value: {
      name: 'Weekly',
      description: null,
      category: null,
      title_template: 'Plan',
      priority: 'medium',
      is_recurring: false,
      recurrence_pattern: null,
      reminder_minutes: null,
      due_date_offset_minutes: null,
      subtasks: [
        { title: 'First', position: 0 },
        { title: 'Second', position: 1 },
      ],
    },
  });
});

test('templates reject invalid recurrence, reminder, offset, and checklist configuration', () => {
  assert.match(errorOf(validateCreateTemplate({
    name: 'Recurring',
    title_template: 'Plan',
    is_recurring: true,
    recurrence_pattern: 'weekly',
  })) ?? '', /due date offset/);
  assert.match(errorOf(validateCreateTemplate({
    name: 'Reminder',
    title_template: 'Plan',
    reminder_minutes: 30,
  })) ?? '', /due date offset/);
  assert.match(errorOf(validateCreateTemplate({
    name: 'Bad offset',
    title_template: 'Plan',
    due_date_offset_minutes: 0,
  })) ?? '', /positive integer/);
  assert.match(errorOf(validateCreateTemplate({
    name: 'Bad checklist',
    title_template: 'Plan',
    subtasks: [{ title: ' ', position: 0 }],
  })) ?? '', /subtask/);
});

test('template updates validate merged recurrence settings and allow clearing a reminder', () => {
  assert.match(errorOf(validateUpdateTemplate({ due_date_offset_minutes: null }, existing)) ?? '',
    /due date offset/);
  assert.deepEqual(validateUpdateTemplate({
    reminder_minutes: null,
  }, existing), { value: { reminder_minutes: null } });
  assert.deepEqual(validateUpdateTemplate({
    is_recurring: false,
  }, existing), { value: { is_recurring: false, recurrence_pattern: null } });
});
