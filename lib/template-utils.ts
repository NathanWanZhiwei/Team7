import type { TemplateSubtask } from './db';
import { formatSingaporeDateTime } from './timezone';

export function serializeTemplateSubtasks(subtasks: TemplateSubtask[]): string | null {
  if (subtasks.length === 0) return null;
  return JSON.stringify(subtasks.map((subtask, position) => ({
    title: subtask.title,
    position,
  })));
}

export function parseTemplateSubtasks(value: string | null): TemplateSubtask[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.some((item) =>
        !item ||
        typeof item !== 'object' ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        !Number.isSafeInteger(item.position) ||
        item.position < 0
      )
    ) {
      return [];
    }
    return parsed
      .map((item, index) => ({ title: item.title as string, position: item.position as number, index }))
      .sort((a, b) => a.position - b.position || a.index - b.index)
      .map(({ title }, position) => ({ title, position }));
  } catch {
    return [];
  }
}

export function templateDueDate(offsetMinutes: number, now: Date): string {
  if (!Number.isSafeInteger(offsetMinutes) || offsetMinutes < 0) {
    throw new RangeError('Due date offset must be a non-negative integer');
  }
  const dueDate = new Date(now.getTime() + offsetMinutes * 60_000);
  if (!Number.isFinite(dueDate.getTime())) throw new RangeError('Due date offset is out of range');
  return formatSingaporeDateTime(dueDate);
}
