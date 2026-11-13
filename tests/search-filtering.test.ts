import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Priority, Subtask, Tag, Todo } from '../lib/db';
import {
  applyFilters,
  DEFAULT_FILTER_STATE,
  hasActiveFilters,
  type FilterState,
} from '../lib/filters';
import {
  deletePreset,
  loadPresets,
  savePreset,
  type PresetStorage,
} from '../lib/filter-presets';
import type { FilterPreset } from '../lib/filters';

const USER_ID = 1;
const PRESETS_KEY = 'todo-app:filter-presets:1';

function makeTodo(overrides: Partial<Todo> & Pick<Todo, 'id' | 'title'>): Todo {
  const { id, title, ...rest } = overrides;
  return {
    id,
    user_id: 1,
    title,
    completed: false,
    due_date: null,
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-01-01T00:00:00.000+08:00',
    updated_at: null,
    ...rest,
  };
}

function makeSubtask(todoId: number, title: string, id: number): Subtask {
  return {
    id,
    todo_id: todoId,
    title,
    completed: false,
    position: id,
    created_at: '2026-01-01T00:00:00.000+08:00',
  };
}

function makeTag(id: number, name: string): Tag {
  return {
    id,
    user_id: 1,
    name,
    color: '#3B82F6',
    created_at: '2026-01-01T00:00:00.000+08:00',
  };
}

function withLocalStorage<T>(
  run: (storage: Map<string, string>, localStorage: PresetStorage) => T,
): T {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  };
  return run(storage, localStorage);
}

const todos: Todo[] = [
  makeTodo({
    id: 1,
    title: 'Team meeting',
    priority: 'high',
    due_date: '2026-01-05T09:00:00.000+08:00',
    tags: [makeTag(7, 'Work')],
    subtasks: [makeSubtask(1, 'Prepare slides', 1)],
  }),
  makeTodo({
    id: 2,
    title: 'Buy groceries',
    priority: 'low',
    completed: true,
    due_date: '2026-01-07T18:00:00.000+08:00',
    tags: [makeTag(8, 'Personal')],
    subtasks: [makeSubtask(2, 'Pick up tea', 2)],
  }),
  makeTodo({ id: 3, title: 'Read book', priority: 'medium' }),
];

test('search matches todo and subtask titles case-insensitively with partial text', () => {
  assert.deepEqual(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'MEET' })
    .map(({ id }) => id), [1]);
  assert.deepEqual(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'slides' })
    .map(({ id }) => id), [1]);
  assert.deepEqual(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'pick up' })
    .map(({ id }) => id), [2]);
  assert.deepEqual(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'missing' }), []);
  assert.deepEqual(applyFilters(todos, DEFAULT_FILTER_STATE), todos);
  assert.deepEqual(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: '   ' }), todos);
});

test('priority, tag, and completion filters exclude non-matching todos', () => {
  const cases: Array<[Partial<FilterState>, number[]]> = [
    [{ priority: 'high' }, [1]],
    [{ priority: 'medium' }, [3]],
    [{ priority: 'low' }, [2]],
    [{ priority: 'all' }, [1, 2, 3]],
    [{ tagId: 7 }, [1]],
    [{ tagId: 8 }, [2]],
    [{ tagId: 9 }, []],
    [{ tagId: 'all' }, [1, 2, 3]],
    [{ completion: 'incomplete' }, [1, 3]],
    [{ completion: 'completed' }, [2]],
    [{ completion: 'all' }, [1, 2, 3]],
  ];

  for (const [filters, expectedIds] of cases) {
    assert.deepEqual(
      applyFilters(todos, { ...DEFAULT_FILTER_STATE, ...filters }).map(({ id }) => id),
      expectedIds,
      JSON.stringify(filters),
    );
  }
});

test('date bounds are independently optional, inclusive, and exclude todos without dates', () => {
  const cases: Array<[Partial<FilterState>, number[]]> = [
    [{ dueDateFrom: '2026-01-06' }, [2]],
    [{ dueDateTo: '2026-01-05' }, [1]],
    [{ dueDateFrom: '2026-01-05', dueDateTo: '2026-01-07' }, [1, 2]],
    [{ dueDateFrom: '2026-01-06', dueDateTo: '2026-01-04' }, []],
    [{ dueDateFrom: '2026-01-08' }, []],
  ];

  for (const [filters, expectedIds] of cases) {
    assert.deepEqual(
      applyFilters(todos, { ...DEFAULT_FILTER_STATE, ...filters }).map(({ id }) => id),
      expectedIds,
      JSON.stringify(filters),
    );
  }
});

test('all five filter dimensions combine using strict AND semantics', () => {
  const matching = makeTodo({
    ...todos[0],
    id: 4,
    completed: true,
    subtasks: [makeSubtask(4, 'prepare slides', 4)],
  });
  const filtered = [todos[0], todos[1], todos[2], matching];
  const filters: FilterState = {
    search: 'SLIDES',
    priority: 'high',
    tagId: 7,
    completion: 'completed',
    dueDateFrom: '2026-01-05',
    dueDateTo: '2026-01-05',
  };

  assert.deepEqual(applyFilters(filtered, filters).map(({ id }) => id), [4]);
});

test('hasActiveFilters recognizes every dimension and ignores whitespace-only search', () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTER_STATE), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTER_STATE, search: '   ' }), false);
  const activeCases: Partial<FilterState>[] = [
    { search: 'book' },
    { priority: 'high' },
    { tagId: 7 },
    { completion: 'completed' },
    { dueDateFrom: '2026-01-01' },
    { dueDateTo: '2026-01-31' },
  ];

  for (const active of activeCases) {
    assert.equal(hasActiveFilters({ ...DEFAULT_FILTER_STATE, ...active }), true);
  }
});

test('saved presets round-trip, delete immediately, and malformed JSON safely loads empty', () => {
  withLocalStorage((storage, localStorage) => {
    const preset: FilterPreset = {
      id: 'morning-review',
      name: 'Morning review',
      filters: {
        search: 'meeting',
        priority: 'high',
        tagId: 7,
        completion: 'incomplete',
        dueDateFrom: '2026-01-01',
        dueDateTo: '2026-01-07',
      },
      createdAt: '2026-01-01T09:00:00.000+08:00',
    };

    assert.deepEqual(loadPresets(USER_ID, localStorage), []);
    assert.deepEqual(savePreset(USER_ID, preset, localStorage), [preset]);
    assert.deepEqual(JSON.parse(storage.get(PRESETS_KEY)!), [preset]);
    assert.deepEqual(loadPresets(USER_ID, localStorage), [preset]);
    assert.deepEqual(deletePreset(USER_ID, preset.id, localStorage), []);
    assert.deepEqual(loadPresets(USER_ID, localStorage), []);

    storage.set(PRESETS_KEY, '{broken JSON');
    assert.deepEqual(loadPresets(USER_ID, localStorage), []);
  });
});
