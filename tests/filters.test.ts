import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import {
  applyFilters,
  DEFAULT_FILTER_STATE,
  hasActiveFilters,
  isDateOnly,
  isFilterPreset,
  isFilterState,
  type FilterPreset,
  type FilterState,
} from '../lib/filters';
import {
  deletePreset,
  loadPresets,
  presetStorageKey,
  savePreset,
  type PresetStorage,
} from '../lib/filter-presets';
import type { Todo } from '../lib/db';

function todo(
  id: number,
  overrides: Partial<Todo> = {},
): Todo {
  return {
    id,
    user_id: 1,
    title: `Todo ${id}`,
    completed: false,
    due_date: null,
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
    ...overrides,
  };
}

class MemoryStorage implements PresetStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('Storage unavailable');
    this.values.set(key, value);
  }
}

const sampleTodos = [
  todo(1, {
    title: 'Team meeting',
    due_date: '2026-02-05T09:00:00.000+08:00',
    priority: 'high',
    tags: [{ id: 2, user_id: 1, name: 'Work', color: '#123456', created_at: '' }],
  }),
  todo(2, {
    title: 'Project',
    completed: true,
    due_date: '2026-02-06T09:00:00.000+08:00',
    priority: 'high',
    subtasks: [{
      id: 1,
      todo_id: 2,
      title: 'Prepare MEETING notes',
      completed: false,
      position: 0,
      created_at: '',
    }],
    tags: [{ id: 2, user_id: 1, name: 'Work', color: '#123456', created_at: '' }],
  }),
  todo(3, { title: 'Personal task', priority: 'low' }),
];

test('search matches todo and subtask titles case-insensitively with trimmed partial text', () => {
  assert.deepEqual(
    applyFilters(sampleTodos, { ...DEFAULT_FILTER_STATE, search: ' MEETING ' }).map((item) => item.id),
    [1, 2],
  );
  assert.deepEqual(
    applyFilters(sampleTodos, { ...DEFAULT_FILTER_STATE, search: 'missing' }),
    [],
  );
  assert.deepEqual(applyFilters(sampleTodos, DEFAULT_FILTER_STATE), sampleTodos);
});

test('priority, tag, completion, and date bounds combine with AND semantics', () => {
  const filters: FilterState = {
    search: '',
    priority: 'high',
    tagId: 2,
    completion: 'completed',
    dueDateFrom: '2026-02-06',
    dueDateTo: '2026-02-06',
  };
  assert.deepEqual(applyFilters(sampleTodos, filters).map((item) => item.id), [2]);
  assert.deepEqual(
    applyFilters(sampleTodos, { ...DEFAULT_FILTER_STATE, priority: 'low' }).map((item) => item.id),
    [3],
  );
  assert.deepEqual(
    applyFilters(sampleTodos, { ...DEFAULT_FILTER_STATE, completion: 'incomplete' })
      .map((item) => item.id),
    [1, 3],
  );
});

test('date bounds are independently optional and exclude todos without due dates', () => {
  assert.deepEqual(
    applyFilters(sampleTodos, { ...DEFAULT_FILTER_STATE, dueDateFrom: '2026-02-06' })
      .map((item) => item.id),
    [2],
  );
  assert.deepEqual(
    applyFilters(sampleTodos, { ...DEFAULT_FILTER_STATE, dueDateTo: '2026-02-05' })
      .map((item) => item.id),
    [1],
  );
  assert.deepEqual(
    applyFilters(sampleTodos, {
      ...DEFAULT_FILTER_STATE,
      dueDateFrom: '2026-02-06',
      dueDateTo: '2026-02-05',
    }),
    [],
  );
  assert.equal(isDateOnly('2024-02-29'), true);
  assert.equal(isDateOnly('2025-02-29'), false);
  assert.equal(isDateOnly('2026-2-01'), false);
});

test('active filters detect every dimension and ignore whitespace search', () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTER_STATE), false);
  const activePatches: Partial<FilterState>[] = [
    { search: 'x' },
    { priority: 'high' },
    { tagId: 2 },
    { completion: 'completed' },
    { dueDateFrom: '2026-01-01' },
    { dueDateTo: '2026-01-01' },
  ];
  for (const patch of activePatches) {
    assert.equal(hasActiveFilters({ ...DEFAULT_FILTER_STATE, ...patch }), true);
  }
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTER_STATE, search: '  ' }), false);
});

test('filter state and presets reject malformed or unsafe local data', () => {
  assert.equal(isFilterState(DEFAULT_FILTER_STATE), true);
  for (const invalid of [
    { ...DEFAULT_FILTER_STATE, priority: 'urgent' },
    { ...DEFAULT_FILTER_STATE, tagId: -1 },
    { ...DEFAULT_FILTER_STATE, completion: 'unknown' },
    { ...DEFAULT_FILTER_STATE, dueDateFrom: '2025-02-29' },
    { ...DEFAULT_FILTER_STATE, search: 'x'.repeat(201) },
  ]) {
    assert.equal(isFilterState(invalid), false);
  }
  const valid: FilterPreset = {
    id: 'preset-1',
    name: 'Work',
    filters: DEFAULT_FILTER_STATE,
    createdAt: '2026-02-01T00:00:00.000Z',
  };
  assert.equal(isFilterPreset(valid), true);
  assert.equal(isFilterPreset({ ...valid, filters: { ...DEFAULT_FILTER_STATE, tagId: 0 } }), false);
  assert.equal(isFilterPreset({ ...valid, name: ' ' }), false);
});

test('filtering 1,000 todos completes under the PRP 100ms target', () => {
  const todos = Array.from({ length: 1_000 }, (_, index) =>
    todo(index + 1, {
      title: `Task ${index + 1}`,
      priority: index % 3 === 0 ? 'high' : 'medium',
      due_date: `2026-02-${String((index % 28) + 1).padStart(2, '0')}T09:00:00.000+08:00`,
    }),
  );
  const started = performance.now();
  const result = applyFilters(todos, {
    ...DEFAULT_FILTER_STATE,
    search: 'task',
    priority: 'high',
    dueDateFrom: '2026-02-10',
    dueDateTo: '2026-02-20',
  });
  assert.ok(result.length > 0);
  assert.ok(performance.now() - started < 100);
});

test('presets round-trip in user-scoped storage and malformed JSON safely loads empty', () => {
  const storage = new MemoryStorage();
  const preset: FilterPreset = {
    id: 'preset-1',
    name: ' Morning work ',
    filters: { ...DEFAULT_FILTER_STATE, priority: 'high', search: 'meeting' },
    createdAt: '2026-02-01T00:00:00.000Z',
  };
  assert.deepEqual(savePreset(1, preset, storage), [{ ...preset, name: 'Morning work' }]);
  assert.deepEqual(loadPresets(1, storage)[0].filters, preset.filters);
  assert.deepEqual(loadPresets(2, storage), []);
  assert.notEqual(presetStorageKey(1), presetStorageKey(2));
  assert.deepEqual(deletePreset(1, preset.id, storage), []);

  storage.values.set(presetStorageKey(1), '{');
  assert.deepEqual(loadPresets(1, storage), []);
  storage.values.set(presetStorageKey(1), JSON.stringify([{ ...preset, filters: { ...preset.filters, tagId: -1 } }]));
  assert.deepEqual(loadPresets(1, storage), []);
});

test('preset storage failures are surfaced and invalid user IDs are rejected', () => {
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const preset: FilterPreset = {
    id: 'preset-1',
    name: 'Work',
    filters: DEFAULT_FILTER_STATE,
    createdAt: '2026-02-01T00:00:00.000Z',
  };
  assert.throws(() => savePreset(1, preset, storage), /Storage unavailable/);
  assert.throws(() => presetStorageKey(0), /valid user ID/);
});
