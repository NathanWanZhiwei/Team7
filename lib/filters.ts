import type { Priority, Todo } from './db';

export type CompletionFilter = 'all' | 'incomplete' | 'completed';

export interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: number | 'all';
  completion: CompletionFilter;
  dueDateFrom: string | null;
  dueDateTo: string | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  priority: 'all',
  tagId: 'all',
  completion: 'all',
  dueDateFrom: null,
  dueDateTo: null,
};

export const MAX_FILTER_SEARCH_LENGTH = 200;
export const MAX_PRESET_NAME_LENGTH = 80;

const priorities: readonly Priority[] = ['high', 'medium', 'low'];
const completions: readonly CompletionFilter[] = ['all', 'incomplete', 'completed'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isFilterState(value: unknown): value is FilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.search === 'string' &&
    state.search.length <= MAX_FILTER_SEARCH_LENGTH &&
    (state.priority === 'all' ||
      (typeof state.priority === 'string' && priorities.includes(state.priority as Priority))) &&
    (state.tagId === 'all' ||
      (typeof state.tagId === 'number' &&
        Number.isSafeInteger(state.tagId) &&
        state.tagId > 0)) &&
    typeof state.completion === 'string' &&
    completions.includes(state.completion as CompletionFilter) &&
    (state.dueDateFrom === null || isDateOnly(state.dueDateFrom)) &&
    (state.dueDateTo === null || isDateOnly(state.dueDateTo))
  );
}

export function isFilterPreset(value: unknown): value is FilterPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === 'string' &&
    preset.id.length > 0 &&
    preset.id.length <= 64 &&
    typeof preset.name === 'string' &&
    preset.name.trim().length > 0 &&
    preset.name.trim().length <= MAX_PRESET_NAME_LENGTH &&
    isFilterState(preset.filters) &&
    typeof preset.createdAt === 'string' &&
    !Number.isNaN(Date.parse(preset.createdAt))
  );
}

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.priority !== 'all' ||
    filters.tagId !== 'all' ||
    filters.completion !== 'all' ||
    filters.dueDateFrom !== null ||
    filters.dueDateTo !== null
  );
}

export function applyFilters(todos: Todo[], filters: FilterState): Todo[] {
  const query = filters.search.trim().toLowerCase();
  return todos.filter((todo) => {
    if (
      query &&
      !todo.title.toLowerCase().includes(query) &&
      !(todo.subtasks ?? []).some((subtask) =>
        subtask.title.toLowerCase().includes(query),
      )
    ) {
      return false;
    }
    if (filters.priority !== 'all' && todo.priority !== filters.priority) return false;
    if (
      filters.tagId !== 'all' &&
      !(todo.tags ?? []).some((tag) => tag.id === filters.tagId)
    ) {
      return false;
    }
    if (filters.completion === 'incomplete' && todo.completed) return false;
    if (filters.completion === 'completed' && !todo.completed) return false;
    if (filters.dueDateFrom !== null || filters.dueDateTo !== null) {
      if (!todo.due_date) return false;
      const dueDate = todo.due_date.slice(0, 10);
      if (filters.dueDateFrom !== null && dueDate < filters.dueDateFrom) return false;
      if (filters.dueDateTo !== null && dueDate > filters.dueDateTo) return false;
    }
    return true;
  });
}
