import type {
  CreateTemplateDto,
  Priority,
  RecurrencePattern,
  Template,
  UpdateTemplateDto,
} from './db';
import { PRIORITY_VALUES } from './priority';
import { isReminderMinutes, type ReminderMinutes } from './reminder-options';
import type { ValidationResult } from './todo-validation';

const recurrenceValues: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
const fields = new Set([
  'name',
  'description',
  'category',
  'title_template',
  'priority',
  'is_recurring',
  'recurrence_pattern',
  'reminder_minutes',
  'due_date_offset_minutes',
  'subtasks',
]);

function parseFields(body: unknown): ValidationResult<Record<string, unknown>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((field) => !fields.has(field));
  if (unknown) return { error: `Unknown field: ${unknown}` };
  return { value: input };
}

function text(value: unknown, label: string, required: boolean): ValidationResult<string | null> {
  if (value === undefined && !required) return { value: null };
  if (value === null && !required) return { value: null };
  if (typeof value !== 'string' || (required && !value.trim())) {
    return { error: `${label} ${required ? 'is required' : 'must be a string or null'}` };
  }
  return { value: value.trim() || null };
}

function validateSubtasks(value: unknown): ValidationResult<CreateTemplateDto['subtasks']> {
  if (value === undefined) return { value: [] };
  if (!Array.isArray(value)) return { error: 'subtasks must be an array' };
  const subtasks: Array<{ title: string; position: number; index: number }> = [];
  for (const [position, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'Each subtask must have a title and position' };
    }
    const subtask = item as Record<string, unknown>;
    if (
      typeof subtask.title !== 'string' ||
      !subtask.title.trim() ||
      (subtask.position !== undefined &&
        (!Number.isSafeInteger(subtask.position) || (subtask.position as number) < 0))
    ) {
      return { error: 'Each subtask must have a non-empty title and valid position' };
    }
    subtasks.push({
      title: subtask.title.trim(),
      position: subtask.position === undefined ? position : subtask.position as number,
      index: position,
    });
  }
  return {
    value: subtasks
      .sort((a, b) => a.position - b.position || a.index - b.index)
      .map(({ title }, position) => ({ title, position })),
  };
}

function validateCommon(
  input: Record<string, unknown>,
  current?: Template,
): ValidationResult<UpdateTemplateDto> {
  const result: UpdateTemplateDto = {};
  const updating = current !== undefined;
  if (input.name !== undefined || !updating) {
    const parsed = text(input.name, 'name', true);
    if ('error' in parsed) return { error: parsed.error };
    result.name = parsed.value!;
  }
  if (input.description !== undefined || !updating) {
    const parsed = text(input.description ?? null, 'description', false);
    if ('error' in parsed) return { error: parsed.error };
    result.description = parsed.value;
  }
  if (input.category !== undefined || !updating) {
    const parsed = text(input.category ?? null, 'category', false);
    if ('error' in parsed) return { error: parsed.error };
    result.category = parsed.value;
  }
  if (input.title_template !== undefined || !updating) {
    const parsed = text(input.title_template, 'title_template', true);
    if ('error' in parsed) return { error: parsed.error };
    result.title_template = parsed.value!;
  }
  if (input.priority !== undefined || !updating) {
    const priority = input.priority !== undefined
      ? input.priority
      : updating ? current.priority : 'medium';
    if (typeof priority !== 'string' || !PRIORITY_VALUES.includes(priority as Priority)) {
      return { error: "priority must be 'high', 'medium', or 'low'" };
    }
    result.priority = priority as Priority;
  }
  if (input.is_recurring !== undefined) {
    if (typeof input.is_recurring !== 'boolean') return { error: 'is_recurring must be a boolean' };
    result.is_recurring = input.is_recurring;
  } else if (!updating) {
    result.is_recurring = false;
  }
  if (input.recurrence_pattern !== undefined) {
    if (
      input.recurrence_pattern !== null &&
      !recurrenceValues.includes(input.recurrence_pattern as RecurrencePattern)
    ) {
      return { error: 'recurrence_pattern must be daily, weekly, monthly, yearly, or null' };
    }
    result.recurrence_pattern = input.recurrence_pattern as RecurrencePattern | null;
  }
  if (input.reminder_minutes !== undefined || !updating) {
    const reminder = input.reminder_minutes !== undefined
      ? input.reminder_minutes
      : updating ? current.reminder_minutes : null;
    if (reminder !== null && !isReminderMinutes(reminder)) {
      return { error: 'reminder_minutes must be a supported reminder offset or null' };
    }
    result.reminder_minutes = reminder as ReminderMinutes | null;
  }
  if (input.due_date_offset_minutes !== undefined || !updating) {
    const offset = input.due_date_offset_minutes !== undefined
      ? input.due_date_offset_minutes
      : updating ? current.due_date_offset_minutes : null;
    if (
      offset !== null &&
      (!Number.isSafeInteger(offset) || (offset as number) < 1)
    ) {
      return { error: 'due_date_offset_minutes must be a positive integer or null' };
    }
    result.due_date_offset_minutes = offset as number | null;
  }
  if (input.subtasks !== undefined || !updating) {
    const subtasks = validateSubtasks(input.subtasks ?? []);
    if ('error' in subtasks) return { error: subtasks.error };
    result.subtasks = subtasks.value;
  }

  const recurring = result.is_recurring ?? current?.is_recurring ?? false;
  const recurrence = result.recurrence_pattern !== undefined
    ? result.recurrence_pattern
    : current?.recurrence_pattern ?? null;
  const offset = result.due_date_offset_minutes !== undefined
    ? result.due_date_offset_minutes
    : current?.due_date_offset_minutes ?? null;
  const reminder = result.reminder_minutes !== undefined
    ? result.reminder_minutes
    : current?.reminder_minutes ?? null;
  if (recurring && (!recurrence || offset === null)) {
    return { error: 'Recurring templates require a recurrence pattern and due date offset' };
  }
  if (!recurring && result.is_recurring === false) {
    result.recurrence_pattern = null;
  }
  if (reminder !== null && offset === null) {
    return { error: 'A due date offset is required to set a reminder' };
  }
  return { value: result };
}

export function validateCreateTemplate(body: unknown): ValidationResult<CreateTemplateDto> {
  const parsed = parseFields(body);
  if ('error' in parsed) return { error: parsed.error };
  return validateCommon(parsed.value) as ValidationResult<CreateTemplateDto>;
}

export function validateUpdateTemplate(
  body: unknown,
  current: Template,
): ValidationResult<UpdateTemplateDto> {
  const parsed = parseFields(body);
  if ('error' in parsed) return { error: parsed.error };
  if (Object.keys(parsed.value).length === 0) return { error: 'At least one field is required' };
  return validateCommon(parsed.value, current);
}
