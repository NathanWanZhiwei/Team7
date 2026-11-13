import type {
  CreateTodoInput,
  Priority,
  RecurrencePattern,
  UpdateTodoInput,
} from './db';
import { PRIORITY_VALUES } from './priority';

const recurrenceValues: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/;
const allowedFields = new Set([
  'title',
  'due_date',
  'priority',
  'is_recurring',
  'recurrence_pattern',
  'reminder_minutes',
]);
const updateFields = new Set([...allowedFields, 'completed']);

export type ValidationResult<T> = { value: T } | { error: string };

export function validatePriority(
  value: unknown,
  defaultToMedium = false,
): ValidationResult<Priority> {
  if (value === undefined || (defaultToMedium && value === null)) {
    return { value: 'medium' };
  }
  if (typeof value === 'string' && PRIORITY_VALUES.includes(value as Priority)) {
    return { value: value as Priority };
  }
  return {
    error: `Invalid priority: ${String(value)}. Must be 'high', 'medium', or 'low'.`,
  };
}

export function normalizeDueDate(value: unknown): ValidationResult<string | null> {
  if (value === null) return { value: null };
  if (typeof value !== 'string') {
    return { error: 'Due date must be an ISO 8601 date-time or null' };
  }

  const match = localDateTimePattern.exec(value);
  if (!match) return { error: 'Due date must be an ISO 8601 date-time or null' };
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText = '0',
    fraction = '',
    zone = '',
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, '0'));
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(hour, minute, second, millisecond);
  if (
    month < 1 ||
    month > 12 ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return { error: 'Due date must be a valid ISO 8601 date-time' };
  }

  let timestamp = calendarDate.getTime();
  if (zone && zone !== 'Z') {
    const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
    if (!offsetMatch) {
      return { error: 'Due date must be a valid ISO 8601 date-time' };
    }
    const offsetHours = Number(offsetMatch[2]);
    const offsetMinutes = Number(offsetMatch[3]);
    if (offsetHours > 23 || offsetMinutes > 59) {
      return { error: 'Due date must be a valid ISO 8601 date-time' };
    }
    const offset = (offsetHours * 60 + offsetMinutes) * 60_000;
    timestamp += offsetMatch[1] === '+' ? -offset : offset;
  } else if (!zone) {
    timestamp -= 8 * 60 * 60_000;
  }

  const singaporeDate = new Date(timestamp + 8 * 60 * 60_000).toISOString();
  return { value: `${singaporeDate.slice(0, -1)}+08:00` };
}

function validateFields(
  body: unknown,
  allowed: Set<string> = allowedFields,
): ValidationResult<Record<string, unknown>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const fields = body as Record<string, unknown>;
  const unknownField = Object.keys(fields).find((field) => !allowed.has(field));
  if (unknownField) return { error: `Unknown field: ${unknownField}` };
  return { value: fields };
}

export function validateCreateTodo(
  body: unknown,
  now = Date.now(),
): ValidationResult<CreateTodoInput> {
  const parsed = validateFields(body);
  if ('error' in parsed) return { error: parsed.error };

  const title = parsed.value.title;
  if (typeof title !== 'string' || !title.trim()) return { error: 'Title is required' };
  const parsedPriority = validatePriority(parsed.value.priority, true);
  if ('error' in parsedPriority) return { error: parsedPriority.error };
  const result: CreateTodoInput = { title: title.trim(), priority: parsedPriority.value };

  if (parsed.value.due_date !== undefined) {
    const dueDate = normalizeDueDate(parsed.value.due_date);
    if ('error' in dueDate) return { error: dueDate.error };
    if (dueDate.value !== null && Date.parse(dueDate.value) < now + 60_000) {
      return { error: 'Due date must be at least 1 minute in the future' };
    }
    result.due_date = dueDate.value;
  }

  if (parsed.value.is_recurring !== undefined) {
    if (typeof parsed.value.is_recurring !== 'boolean') {
      return { error: 'is_recurring must be a boolean' };
    }
    result.is_recurring = parsed.value.is_recurring;
  }
  if (parsed.value.recurrence_pattern !== undefined) {
    const pattern = parsed.value.recurrence_pattern;
    if (pattern !== null && !recurrenceValues.includes(pattern as RecurrencePattern)) {
      return { error: 'recurrence_pattern must be daily, weekly, monthly, yearly, or null' };
    }
    result.recurrence_pattern = pattern as RecurrencePattern | null;
  }
  if (parsed.value.reminder_minutes !== undefined) {
    const minutes = parsed.value.reminder_minutes;
    if (minutes !== null && (!Number.isSafeInteger(minutes) || (minutes as number) < 0)) {
      return { error: 'reminder_minutes must be a non-negative integer or null' };
    }
    result.reminder_minutes = minutes as number | null;
  }
  return { value: result };
}

export function validateUpdateTodo(body: unknown): ValidationResult<UpdateTodoInput> {
  const parsed = validateFields(body, updateFields);
  if ('error' in parsed) return { error: parsed.error };
  if (Object.keys(parsed.value).length === 0) return { error: 'At least one field is required' };

  const result: UpdateTodoInput = {};
  if (parsed.value.title !== undefined) {
    if (typeof parsed.value.title !== 'string' || !parsed.value.title.trim()) {
      return { error: 'Title cannot be empty' };
    }
    result.title = parsed.value.title.trim();
  }
  if (parsed.value.completed !== undefined) {
    if (typeof parsed.value.completed !== 'boolean') return { error: 'completed must be a boolean' };
    result.completed = parsed.value.completed;
  }
  if (parsed.value.due_date !== undefined) {
    const dueDate = normalizeDueDate(parsed.value.due_date);
    if ('error' in dueDate) return { error: dueDate.error };
    result.due_date = dueDate.value;
  }
  if (parsed.value.priority !== undefined) {
    const parsedPriority = validatePriority(parsed.value.priority);
    if ('error' in parsedPriority) return { error: parsedPriority.error };
    result.priority = parsedPriority.value;
  }
  if (parsed.value.is_recurring !== undefined) {
    if (typeof parsed.value.is_recurring !== 'boolean') {
      return { error: 'is_recurring must be a boolean' };
    }
    result.is_recurring = parsed.value.is_recurring;
  }
  if (parsed.value.recurrence_pattern !== undefined) {
    const pattern = parsed.value.recurrence_pattern;
    if (pattern !== null && !recurrenceValues.includes(pattern as RecurrencePattern)) {
      return { error: 'recurrence_pattern must be daily, weekly, monthly, yearly, or null' };
    }
    result.recurrence_pattern = pattern as RecurrencePattern | null;
  }
  if (parsed.value.reminder_minutes !== undefined) {
    const minutes = parsed.value.reminder_minutes;
    if (minutes !== null && (!Number.isSafeInteger(minutes) || (minutes as number) < 0)) {
      return { error: 'reminder_minutes must be a non-negative integer or null' };
    }
    result.reminder_minutes = minutes as number | null;
  }
  return { value: result };
}
