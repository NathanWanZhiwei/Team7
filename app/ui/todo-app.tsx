'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Priority, RecurrencePattern, Todo, UpdateTodoInput } from '@/lib/db';
import {
  isReminderMinutes,
  REMINDER_LABELS,
  REMINDER_OPTIONS,
  type ReminderMinutes,
} from '@/lib/reminder-options';
import { sectionTodos } from '@/lib/todo-sorting';
import { LogoutButton } from './logout-button';
import { useNotifications } from '@/lib/hooks/useNotifications';

type PriorityFilter = Priority | 'all';
type TodoUpdateResponse = { todo: Todo; nextInstance?: Todo };

const priorityLabels: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const recurrenceLabels: Record<RecurrencePattern, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const dueDateFormatter = new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Singapore',
});

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function singaporeInputValue(value: string | null): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

function dueDateFromInput(value: string): string | null {
  return value ? `${value}:00.000+08:00` : null;
}

function reminderFromInput(value: string): ReminderMinutes | null {
  const minutes = Number(value);
  return value && isReminderMinutes(minutes) ? minutes : null;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`priority-badge priority-badge--${priority}`}>
      {priorityLabels[priority]}
    </span>
  );
}

function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span className="recurrence-badge">
      <span aria-hidden="true">🔄</span> {recurrenceLabels[pattern].toLowerCase()}
    </span>
  );
}

function RecurrenceFields({
  isRecurring,
  pattern,
  hasDueDate,
  onToggle,
  onPatternChange,
}: {
  isRecurring: boolean;
  pattern: RecurrencePattern;
  hasDueDate: boolean;
  onToggle: (checked: boolean) => void;
  onPatternChange: (pattern: RecurrencePattern) => void;
}) {
  return (
    <div className="todo-recurrence-controls">
      <label className="todo-repeat-toggle">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(event) => onToggle(event.target.checked)}
          disabled={!hasDueDate && !isRecurring}
        />
        Repeat
      </label>
      {isRecurring && (
        <select
          aria-label="Recurrence pattern"
          value={pattern}
          onChange={(event) => onPatternChange(event.target.value as RecurrencePattern)}
        >
          {(Object.keys(recurrenceLabels) as RecurrencePattern[]).map((value) => (
            <option key={value} value={value}>
              {recurrenceLabels[value]}
            </option>
          ))}
        </select>
      )}
      {!hasDueDate && !isRecurring && (
        <span className="todo-recurrence-hint">Set a due date to enable repeat</span>
      )}
    </div>
  );
}

function ReminderBadge({ minutes }: { minutes: number | null }) {
  if (!isReminderMinutes(minutes)) return null;
  return <span className="reminder-badge">🔔 {REMINDER_LABELS[minutes]}</span>;
}

function TodoSection({
  title,
  todos,
  busyId,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  todos: Todo[];
  busyId: number | null;
  onToggle: (todo: Todo, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  return (
    <section className="todo-section" aria-label={`${title} todos`}>
      <div className="todo-section-heading">
        <h2>{title}</h2>
        <span className="todo-count" aria-label={`${todos.length} todos`}>
          {todos.length}
        </span>
      </div>
      {todos.length === 0 ? (
        <p className="todo-empty">Nothing here.</p>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <li className="todo-row" key={todo.id}>
              <input
                type="checkbox"
                checked={todo.completed}
                disabled={busyId === todo.id}
                onChange={(event) => onToggle(todo, event.target.checked)}
                aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
              />
              <div className="todo-copy">
                <div className="todo-title-line">
                  <span className={todo.completed ? 'todo-title todo-title--completed' : 'todo-title'}>
                    {todo.title}
                  </span>
                  <PriorityBadge priority={todo.priority} />
                  {todo.is_recurring && todo.recurrence_pattern && (
                    <RecurrenceBadge pattern={todo.recurrence_pattern} />
                  )}
                  <ReminderBadge minutes={todo.reminder_minutes} />
                </div>
                {todo.due_date && (
                  <time className="todo-due" dateTime={todo.due_date}>
                    Due {dueDateFormatter.format(new Date(todo.due_date))}
                  </time>
                )}
              </div>
              <div className="todo-row-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busyId === todo.id}
                  onClick={() => onEdit(todo)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-button text-button--danger"
                  disabled={busyId === todo.id}
                  onClick={() => onDelete(todo)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TodoApp({ userId, username }: { userId: number; username: string }) {
  const notifications = useNotifications();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [createTitle, setCreateTitle] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');
  const [createPriority, setCreatePriority] = useState<Priority>('medium');
  const [createRecurring, setCreateRecurring] = useState(false);
  const [createRecurrencePattern, setCreateRecurrencePattern] =
    useState<RecurrencePattern>('daily');
  const [createReminderMinutes, setCreateReminderMinutes] =
    useState<ReminderMinutes | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editRecurring, setEditRecurring] = useState(false);
  const [editRecurrencePattern, setEditRecurrencePattern] =
    useState<RecurrencePattern>('daily');
  const [editReminderMinutes, setEditReminderMinutes] =
    useState<ReminderMinutes | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTodos() {
      try {
        const loaded = await requestJson<Todo[]>('/api/todos');
        if (active) setTodos(loaded);
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, 'Could not load todos.'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTodos();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!editingTodo) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setEditingTodo(null);
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [editingTodo]);

  const sections = useMemo(() => {
    const visibleTodos =
      priorityFilter === 'all'
        ? todos
        : todos.filter((todo) => todo.priority === priorityFilter);
    return sectionTodos(visibleTodos);
  }, [todos, priorityFilter]);

  async function createTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createTitle.trim()) {
      setError('Title is required.');
      return;
    }

    setError(null);
    setCreating(true);
    const temporaryId = -Date.now();
    const input = {
      title: createTitle.trim(),
      due_date: dueDateFromInput(createDueDate),
      priority: createPriority,
      is_recurring: createRecurring,
      recurrence_pattern: createRecurring ? createRecurrencePattern : null,
      reminder_minutes: createReminderMinutes,
    };
    const optimisticTodo: Todo = {
      id: temporaryId,
      user_id: userId,
      title: input.title,
      completed: false,
      due_date: input.due_date,
      priority: input.priority,
      is_recurring: input.is_recurring,
      recurrence_pattern: input.recurrence_pattern,
      reminder_minutes: input.reminder_minutes,
      last_notification_sent: null,
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    setTodos((current) => [...current, optimisticTodo]);

    try {
      const saved = await requestJson<Todo>('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      setTodos((current) =>
        current.map((todo) => (todo.id === temporaryId ? saved : todo)),
      );
      setCreateTitle('');
      setCreateDueDate('');
      setCreatePriority('medium');
      setCreateRecurring(false);
      setCreateRecurrencePattern('daily');
      setCreateReminderMinutes(null);
    } catch (createError) {
      setTodos((current) => current.filter((todo) => todo.id !== temporaryId));
      setError(getErrorMessage(createError, 'Could not create todo. Please try again.'));
    } finally {
      setCreating(false);
    }
  }

  async function updateTodo(id: number, patch: UpdateTodoInput): Promise<boolean> {
    const previous = todos.find((todo) => todo.id === id);
    if (!previous) return false;
    setError(null);
    setBusyId(id);
    setTodos((current) =>
      current.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)),
    );
    try {
      const result = await requestJson<TodoUpdateResponse>(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setTodos((current) => {
        const updated = current.map((todo) => (todo.id === id ? result.todo : todo));
        if (
          result.nextInstance &&
          !updated.some((todo) => todo.id === result.nextInstance?.id)
        ) {
          return [...updated, result.nextInstance];
        }
        return updated;
      });
      return true;
    } catch (updateError) {
      setTodos((current) => current.map((todo) => (todo.id === id ? previous : todo)));
      setError(getErrorMessage(updateError, 'Could not update todo. Please try again.'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTodo(todo: Todo) {
    setError(null);
    setBusyId(todo.id);
    setTodos((current) => current.filter((item) => item.id !== todo.id));
    try {
      await requestJson<{ success: boolean }>(`/api/todos/${todo.id}`, {
        method: 'DELETE',
      });
    } catch (deleteError) {
      setTodos((current) =>
        current.some((item) => item.id === todo.id) ? current : [...current, todo],
      );
      setError(getErrorMessage(deleteError, 'Could not delete todo. Please try again.'));
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(todo: Todo) {
    setEditingTodo(todo);
    setEditTitle(todo.title);
    setEditDueDate(singaporeInputValue(todo.due_date));
    setEditPriority(todo.priority);
    setEditRecurring(todo.is_recurring);
    setEditRecurrencePattern(todo.recurrence_pattern ?? 'daily');
    setEditReminderMinutes(
      isReminderMinutes(todo.reminder_minutes) ? todo.reminder_minutes : null,
    );
    setError(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTodo) return;
    const updated = await updateTodo(editingTodo.id, {
      title: editTitle.trim(),
      due_date: dueDateFromInput(editDueDate),
      priority: editPriority,
      is_recurring: editRecurring,
      recurrence_pattern: editRecurring ? editRecurrencePattern : null,
      reminder_minutes: editReminderMinutes,
    });
    if (updated) setEditingTodo(null);
  }

  return (
    <main className="todo-page">
      <div className="todo-shell">
        <header className="todo-header">
          <div>
            <p className="todo-eyebrow">Personal workspace</p>
            <h1>My todos</h1>
            <p className="muted">Signed in as <strong>{username}</strong></p>
          </div>
          <div className="todo-header-actions">
            <button
              type="button"
              className={
                notifications.permission === 'granted'
                  ? 'notification-button notification-button--enabled'
                  : 'notification-button'
              }
              disabled={!notifications.supported || notifications.permission === 'granted'}
              aria-pressed={notifications.permission === 'granted'}
              onClick={() => void notifications.requestPermission()}
            >
              {!notifications.supported
                ? 'Notifications unavailable'
                : notifications.permission === 'granted'
                  ? '🔔 Notifications On'
                  : '🔔 Enable Notifications'}
            </button>
            <Link href="/settings/passkeys">Manage passkeys</Link>
            <LogoutButton />
          </div>
        </header>
        {notifications.error && (
          <p className="todo-error" role="alert">{notifications.error}</p>
        )}

        <section className="todo-card todo-create-card" aria-labelledby="create-todo-heading">
          <h2 id="create-todo-heading">Add a todo</h2>
          <form className="todo-form" onSubmit={(event) => void createTodo(event)}>
            <label className="todo-field todo-field--title">
              Title
              <input
                autoComplete="off"
                required
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="What needs to get done?"
              />
            </label>
            <label className="todo-field">
              Due date and time (Singapore)
              <input
                type="datetime-local"
                value={createDueDate}
                onChange={(event) => {
                  setCreateDueDate(event.target.value);
                  if (!event.target.value) setCreateReminderMinutes(null);
                }}
              />
            </label>
            <label className="todo-field">
              Priority
              <select
                value={createPriority}
                onChange={(event) => setCreatePriority(event.target.value as Priority)}
              >
                {(['high', 'medium', 'low'] as Priority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {priorityLabels[priority]}
                  </option>
                ))}
              </select>
            </label>
            <RecurrenceFields
              isRecurring={createRecurring}
              pattern={createRecurrencePattern}
              hasDueDate={Boolean(createDueDate)}
              onToggle={setCreateRecurring}
              onPatternChange={setCreateRecurrencePattern}
            />
            <label className="todo-field">
              Reminder
              <select
                aria-label="Reminder"
                value={createReminderMinutes ?? ''}
                disabled={!createDueDate}
                onChange={(event) =>
                  setCreateReminderMinutes(reminderFromInput(event.target.value))
                }
              >
                <option value="">None</option>
                {REMINDER_OPTIONS.map(({ minutes, label }) => (
                  <option key={minutes} value={minutes}>{label}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={creating}>
              {creating ? 'Adding…' : 'Add todo'}
            </button>
          </form>
        </section>

        <section className="todo-card todo-list-card" aria-labelledby="todo-list-heading">
          <div className="todo-list-toolbar">
            <div>
              <h2 id="todo-list-heading">Your list</h2>
              <p className="muted">High priority items appear first.</p>
            </div>
            <label className="todo-filter">
              Priority filter
              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value as PriorityFilter)
                }
              >
                <option value="all">All Priorities</option>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </label>
          </div>

          {error && <p className="todo-error" role="alert">{error}</p>}
          {loading ? (
            <p className="todo-empty" role="status">Loading todos…</p>
          ) : (
            <div className="todo-sections">
              <TodoSection
                title="Overdue"
                todos={sections.overdue}
                busyId={busyId}
                onToggle={(todo, completed) => void updateTodo(todo.id, { completed })}
                onEdit={startEditing}
                onDelete={(todo) => void deleteTodo(todo)}
              />
              <TodoSection
                title="Pending"
                todos={sections.pending}
                busyId={busyId}
                onToggle={(todo, completed) => void updateTodo(todo.id, { completed })}
                onEdit={startEditing}
                onDelete={(todo) => void deleteTodo(todo)}
              />
              <TodoSection
                title="Completed"
                todos={sections.completed}
                busyId={busyId}
                onToggle={(todo, completed) => void updateTodo(todo.id, { completed })}
                onEdit={startEditing}
                onDelete={(todo) => void deleteTodo(todo)}
              />
            </div>
          )}
        </section>
      </div>

      {editingTodo && (
        <div
          className="todo-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditingTodo(null);
          }}
        >
          <section
            className="todo-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-todo-heading"
          >
            <h2 id="edit-todo-heading">Edit todo</h2>
            <form className="todo-form todo-edit-form" onSubmit={(event) => void saveEdit(event)}>
              <label className="todo-field">
                Title
                <input
                  autoFocus
                  required
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              </label>
              <label className="todo-field">
                Due date and time (Singapore)
                <input
                  type="datetime-local"
                  value={editDueDate}
                  onChange={(event) => {
                    setEditDueDate(event.target.value);
                    if (!event.target.value) setEditReminderMinutes(null);
                  }}
                />
              </label>
              <label className="todo-field">
                Priority
                <select
                  value={editPriority}
                  onChange={(event) => setEditPriority(event.target.value as Priority)}
                >
                  {(['high', 'medium', 'low'] as Priority[]).map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityLabels[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <RecurrenceFields
                isRecurring={editRecurring}
                pattern={editRecurrencePattern}
                hasDueDate={Boolean(editDueDate)}
                onToggle={setEditRecurring}
                onPatternChange={setEditRecurrencePattern}
              />
              <label className="todo-field">
                Reminder
                <select
                  aria-label="Edit reminder"
                  value={editReminderMinutes ?? ''}
                  disabled={!editDueDate}
                  onChange={(event) =>
                    setEditReminderMinutes(reminderFromInput(event.target.value))
                  }
                >
                  <option value="">None</option>
                  {REMINDER_OPTIONS.map(({ minutes, label }) => (
                    <option key={minutes} value={minutes}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="todo-modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditingTodo(null)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={busyId === editingTodo.id}>
                  Save changes
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
