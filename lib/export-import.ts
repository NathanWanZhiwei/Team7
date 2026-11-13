import { z } from 'zod';
import type { Todo, TodoExport } from './db';
import { isReminderMinutes } from './reminder-options';
import { normalizeDueDate } from './todo-validation';
import { formatSingaporeDateTime, getSingaporeNow } from './timezone';

const nonBlank = z.string().refine((value) => value.trim().length > 0);

export const importSchema = z.object({
  version: z.literal(1),
  exported_at: z.string(),
  todos: z.array(z.object({
    title: nonBlank,
    completed: z.boolean(),
    due_date: z.string().nullable().refine((value) => !('error' in normalizeDueDate(value))),
    priority: z.enum(['high', 'medium', 'low']),
    is_recurring: z.boolean(),
    recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable(),
    reminder_minutes: z.number().int().refine(isReminderMinutes).nullable(),
    created_at: z.string(),
    subtasks: z.array(z.object({
      title: nonBlank,
      completed: z.boolean(),
      position: z.number().int(),
    })),
    tags: z.array(z.object({
      name: nonBlank,
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    })),
  }).refine((item) =>
    (!item.is_recurring || (item.due_date !== null && item.recurrence_pattern !== null)) &&
    (item.reminder_minutes === null || item.due_date !== null),
  )),
});

export function toExportPayload(todos: Todo[], now = getSingaporeNow()): TodoExport {
  return {
    version: 1,
    exported_at: formatSingaporeDateTime(now),
    todos: todos.map((todo) => ({
      title: todo.title,
      completed: todo.completed,
      due_date: todo.due_date,
      priority: todo.priority,
      is_recurring: todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes,
      created_at: todo.created_at,
      subtasks: (todo.subtasks ?? []).map(({ title, completed, position }) => ({
        title, completed, position,
      })),
      tags: (todo.tags ?? []).map(({ name, color }) => ({ name, color })),
    })),
  };
}

export function exportFilename(format: 'json' | 'csv', now = getSingaporeNow()): string {
  return `todos-${formatSingaporeDateTime(now).slice(0, 10)}.${format}`;
}

function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? '' : String(value);
  // Spreadsheet programs can execute formulas even inside quoted CSV cells.
  if (typeof value === 'string' && (/^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text))) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(todos: Todo[]): string {
  const header = 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder';
  const rows = todos.map((todo) => [
    todo.id, todo.title, todo.completed, todo.due_date, todo.priority,
    todo.is_recurring, todo.recurrence_pattern, todo.reminder_minutes,
  ].map(csvCell).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}
