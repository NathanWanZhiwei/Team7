'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ImportResult, Priority, RecurrencePattern, Subtask, Tag, Todo, UpdateTodoInput } from '@/lib/db';
import {
  isReminderMinutes,
  REMINDER_LABELS,
  REMINDER_OPTIONS,
  type ReminderMinutes,
} from '@/lib/reminder-options';
import { sectionTodos } from '@/lib/todo-sorting';
import { calculateProgress } from '@/lib/subtasks';
import { tagBackground } from '@/lib/tag-validation';
import { requestJson } from '@/lib/client-api';
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

function TagPill({ tag, selected = true, onClick, disabled = false }: {
  tag: Tag;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tag-pill${selected ? ' tag-pill--selected' : ''}`}
      style={{ backgroundColor: selected ? tagBackground(tag.color) : undefined, borderColor: tag.color }}
      aria-pressed={selected}
      title={tag.name}
      onClick={onClick}
      disabled={disabled}
    >
      {selected && <span aria-hidden="true">✓</span>}
      <span>{tag.name}</span>
    </button>
  );
}

function TagSelector({ tags, selected, onChange, disabled }: {
  tags: Tag[];
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  if (!tags.length) return null;
  return (
    <fieldset className="tag-selector" disabled={disabled}>
      <legend>Tags</legend>
      <div className="tag-pills">
        {tags.map((tag) => (
          <TagPill
            key={tag.id}
            tag={tag}
            selected={selected.includes(tag.id)}
            disabled={disabled}
            onClick={() => onChange(selected.includes(tag.id)
              ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ManageTags({ tags, onSave, onDelete, onClose }: {
  tags: Tag[];
  onSave: (id: number | null, name: string, color: string) => Promise<void>;
  onDelete: (tag: Tag) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(editingId, name, color);
      setName('');
      setColor('#3B82F6');
      setEditingId(null);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Could not save tag.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag: Tag) {
    if (!window.confirm(`Delete tag "${tag.name}" from all todos?`)) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(tag);
      if (editingId === tag.id) {
        setEditingId(null);
        setName('');
        setColor('#3B82F6');
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Could not delete tag.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="todo-modal tag-modal"
      aria-labelledby="manage-tags-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="manage-tags-heading">Manage Tags</h2>
      {error && <p className="todo-error" role="alert">{error}</p>}
      <ul className="tag-management-list">
        {tags.map((tag) => (
          <li key={tag.id}>
            <TagPill tag={tag} onClick={() => {
              setEditingId(tag.id); setName(tag.name); setColor(tag.color);
            }} disabled={busy} />
            <button type="button" className="text-button" disabled={busy} onClick={() => {
              setEditingId(tag.id); setName(tag.name); setColor(tag.color);
            }} aria-label={`Edit tag ${tag.name}`}>Edit</button>
            <button type="button" className="text-button text-button--danger" disabled={busy}
              onClick={() => void remove(tag)} aria-label={`Delete tag ${tag.name}`}>Delete</button>
          </li>
        ))}
      </ul>
      <form className="todo-form todo-edit-form" onSubmit={(event) => void save(event)}>
        <label className="todo-field">
          Tag name
          <input required autoFocus value={name} disabled={busy}
            onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="todo-field">
          Tag color
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#3B82F6'}
            disabled={busy} onChange={(event) => setColor(event.target.value)} />
        </label>
        <label className="todo-field">
          Hex color
          <input required pattern="#[0-9A-Fa-f]{6}" value={color} disabled={busy}
            onChange={(event) => setColor(event.target.value)} />
        </label>
        <div className="todo-modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>Close</button>
          {editingId !== null && <button type="button" className="secondary" disabled={busy}
            onClick={() => { setEditingId(null); setName(''); setColor('#3B82F6'); }}>Cancel edit</button>}
          <button type="submit" disabled={busy}>{editingId === null ? 'Create Tag' : 'Update Tag'}</button>
        </div>
      </form>
    </dialog>
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

function SubtaskList({
  todoId,
  subtasks,
  onChange,
  onError,
}: {
  todoId: number;
  subtasks: Subtask[];
  onChange: (update: (current: Subtask[]) => Subtask[]) => void;
  onError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [busySubtaskId, setBusySubtaskId] = useState<number | null>(null);
  const { completed, total, percent } = calculateProgress(subtasks);

  async function addSubtask() {
    const title = newTitle.trim();
    if (!title || adding) return;

    setAdding(true);
    const optimistic: Subtask = {
      id: -Date.now(),
      todo_id: todoId,
      title,
      completed: false,
      position: Math.max(-1, ...subtasks.map((subtask) => subtask.position)) + 1,
      created_at: new Date().toISOString(),
    };
    onChange((current) => [...current, optimistic]);
    try {
      const saved = await requestJson<Subtask>(`/api/todos/${todoId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      onChange((current) =>
        current.map((subtask) => (subtask.id === optimistic.id ? saved : subtask)),
      );
      setNewTitle('');
    } catch (error) {
      onChange((current) => current.filter((subtask) => subtask.id !== optimistic.id));
      onError(getErrorMessage(error, 'Could not add subtask.'));
    } finally {
      setAdding(false);
    }
  }

  async function toggleSubtask(subtask: Subtask) {
    if (busySubtaskId !== null) return;
    setBusySubtaskId(subtask.id);
    onChange((current) =>
      current.map((item) =>
        item.id === subtask.id ? { ...item, completed: !subtask.completed } : item,
      ),
    );
    try {
      const updated = await requestJson<Subtask>(`/api/subtasks/${subtask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !subtask.completed }),
      });
      onChange((current) =>
        current.map((item) => (item.id === subtask.id ? updated : item)),
      );
    } catch (error) {
      onChange((current) =>
        current.map((item) =>
          item.id === subtask.id ? { ...item, completed: subtask.completed } : item,
        ),
      );
      onError(getErrorMessage(error, 'Could not update subtask.'));
    } finally {
      setBusySubtaskId(null);
    }
  }

  async function deleteSubtask(subtask: Subtask) {
    if (busySubtaskId !== null) return;
    setBusySubtaskId(subtask.id);
    onChange((current) => current.filter((item) => item.id !== subtask.id));
    try {
      await requestJson<{ success: boolean }>(`/api/subtasks/${subtask.id}`, {
        method: 'DELETE',
      });
    } catch (error) {
      onChange((current) =>
        [...current, subtask].sort(
          (left, right) => left.position - right.position || left.id - right.id,
        ),
      );
      onError(getErrorMessage(error, 'Could not delete subtask.'));
    } finally {
      setBusySubtaskId(null);
    }
  }

  return (
    <div className="todo-subtasks">
      <button
        type="button"
        className="text-button subtask-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? '▼' : '▶'} Subtasks
      </button>
      {total > 0 && (
        <div className="subtask-progress">
          <div className="subtask-progress-label">
            <span>{completed}/{total} subtasks</span>
            <span>{percent}%</span>
          </div>
          <div
            className="subtask-progress-track"
            role="progressbar"
            aria-label="Subtask progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className={`subtask-progress-fill${percent === 100 ? ' subtask-progress-fill--complete' : ''}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
      {expanded && (
        <div className="subtask-list">
          {subtasks.map((subtask) => (
            <div className="subtask-item" key={subtask.id}>
              <input
                type="checkbox"
                checked={subtask.completed}
                disabled={busySubtaskId !== null}
                onChange={() => void toggleSubtask(subtask)}
                aria-label={`Mark "${subtask.title}" as ${subtask.completed ? 'incomplete' : 'complete'}`}
              />
              <span className={subtask.completed ? 'subtask-title subtask-title--completed' : 'subtask-title'}>
                {subtask.title}
              </span>
              <button
                type="button"
                className="text-button text-button--danger"
                disabled={busySubtaskId !== null}
                onClick={() => void deleteSubtask(subtask)}
                aria-label={`Delete subtask "${subtask.title}"`}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="subtask-add">
            <input
              type="text"
              value={newTitle}
              disabled={adding}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addSubtask();
                }
              }}
              placeholder="Add subtask..."
              aria-label="New subtask title"
            />
            <button
              type="button"
              className="text-button"
              disabled={adding || !newTitle.trim()}
              onClick={() => void addSubtask()}
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TodoSection({
  title,
  todos,
  busyId,
  onToggle,
  onEdit,
  onDelete,
  onTagFilter,
  onSubtasksChange,
  onError,
}: {
  title: string;
  todos: Todo[];
  busyId: number | null;
  onToggle: (todo: Todo, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onTagFilter: (tagId: number) => void;
  onSubtasksChange: (
    todoId: number,
    update: (current: Subtask[]) => Subtask[],
  ) => void;
  onError: (message: string) => void;
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
                disabled={busyId === todo.id || todo.id < 0}
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
                <div className="tag-pills">
                  {todo.tags?.map((tag) => (
                    <TagPill key={tag.id} tag={tag} onClick={() => onTagFilter(tag.id)} />
                  ))}
                </div>
              </div>
              <div className="todo-row-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busyId === todo.id || todo.id < 0}
                  onClick={() => onEdit(todo)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-button text-button--danger"
                  disabled={busyId === todo.id || todo.id < 0}
                  onClick={() => onDelete(todo)}
                >
                  Delete
                </button>
              </div>
              <SubtaskList
                todoId={todo.id}
                subtasks={todo.subtasks ?? []}
                onChange={(update) => onSubtasksChange(todo.id, update)}
                onError={onError}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExportImportToolbar({ onImported }: { onImported: () => Promise<void> }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  async function download(format: 'json' | 'csv') {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/todos/export?format=${format}`);
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? 'Failed to export todos');
      }
      const blob = await response.blob();
      const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1];
      if (!filename) throw new Error('Export response did not include a filename');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setMessage({ type: 'error', text: getErrorMessage(downloadError, 'Failed to export todos') });
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    setMessage(file.size > 10 * 1024 * 1024
      ? { type: 'info', text: 'This file is over 10 MB; importing may take a while.' } : null);
    try {
      const text = await file.text();
      JSON.parse(text);
      const result = await requestJson<ImportResult>('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      try {
        await onImported();
        setMessage({ type: 'success', text: `Successfully imported ${result.imported} todos` });
      } catch (refreshError) {
        setMessage({
          type: 'error',
          text: `Successfully imported ${result.imported} todos, but could not refresh the list. Reload the page; do not re-import. ${getErrorMessage(refreshError, '')}`,
        });
      }
    } catch (importError) {
      setMessage({
        type: 'error',
        text: importError instanceof SyntaxError
          ? 'Invalid JSON format' : getErrorMessage(importError, 'Failed to import todos'),
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <section className="transfer-toolbar" aria-label="Export and import todos" aria-busy={busy}>
      <div className="transfer-actions">
        <button type="button" className="export-json" disabled={busy} onClick={() => void download('json')}>
          Export JSON
        </button>
        <button type="button" className="export-csv" disabled={busy} onClick={() => void download('csv')}>
          Export CSV
        </button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Working...' : 'Import'}
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Import JSON file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>
      <p className="muted">Import creates new todos and does not merge with existing ones. CSV is export-only.</p>
      {message && (
        <p className={message.type === 'error' ? 'todo-error' : 'transfer-message'}
          role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const [managingTags, setManagingTags] = useState(false);
  const [createTagIds, setCreateTagIds] = useState<number[]>([]);
  const [editTagIds, setEditTagIds] = useState<number[]>([]);
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
        const [loaded, loadedTags] = await Promise.all([
          requestJson<Todo[]>('/api/todos'), requestJson<Tag[]>('/api/tags'),
        ]);
        if (active) { setTodos(loaded); setTags(loadedTags); }
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
    const visibleTodos = todos.filter((todo) =>
      (priorityFilter === 'all' || todo.priority === priorityFilter) &&
      (tagFilter === null || todo.tags?.some((tag) => tag.id === tagFilter)),
    );
    return sectionTodos(visibleTodos);
  }, [todos, priorityFilter, tagFilter]);

  async function refreshAfterImport() {
    const [loaded, loadedTags] = await Promise.all([
      requestJson<Todo[]>('/api/todos'), requestJson<Tag[]>('/api/tags'),
    ]);
    setTodos(loaded);
    setTags(loadedTags);
    setPriorityFilter('all');
    setTagFilter(null);
  }

  async function saveTag(id: number | null, name: string, color: string) {
    const saved = await requestJson<Tag>(id === null ? '/api/tags' : `/api/tags/${id}`, {
      method: id === null ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    setTags((current) => id === null ? [...current, saved]
      : current.map((tag) => tag.id === id ? saved : tag));
    setTodos((current) => current.map((todo) => ({
      ...todo, tags: todo.tags?.map((tag) => tag.id === saved.id ? saved : tag),
    })));
  }

  async function deleteTag(tag: Tag) {
    await requestJson<{ success: boolean }>(`/api/tags/${tag.id}`, { method: 'DELETE' });
    setTags((current) => current.filter((item) => item.id !== tag.id));
    setTodos((current) => current.map((todo) => ({
      ...todo, tags: todo.tags?.filter((item) => item.id !== tag.id),
    })));
    setCreateTagIds((current) => current.filter((id) => id !== tag.id));
    setEditTagIds((current) => current.filter((id) => id !== tag.id));
    setTagFilter((current) => current === tag.id ? null : current);
  }

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
      tag_ids: createTagIds,
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
      tags: tags.filter((tag) => createTagIds.includes(tag.id)),
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
      setCreateTagIds([]);
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

  function updateTodoSubtasks(
    todoId: number,
    update: (current: Subtask[]) => Subtask[],
  ) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === todoId
          ? { ...todo, subtasks: update(todo.subtasks ?? []) }
          : todo,
      ),
    );
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
    setEditTagIds(todo.tags?.map((tag) => tag.id) ?? []);
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
      tag_ids: editTagIds,
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
            <Link className="calendar-navigation-link" href="/calendar">Calendar</Link>
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
        <ExportImportToolbar onImported={refreshAfterImport} />
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
            <button type="submit" disabled={creating || loading}>
              {creating ? 'Adding…' : 'Add todo'}
            </button>
            <TagSelector tags={tags} selected={createTagIds}
              onChange={setCreateTagIds} disabled={creating} />
          </form>
          <button type="button" className="secondary" disabled={loading || creating || busyId !== null}
            onClick={() => setManagingTags(true)}>+ Manage Tags</button>
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
            <label className="todo-filter">
              Tag filter
              <select aria-label="Filter by tag" value={tagFilter ?? ''}
                onChange={(event) => setTagFilter(event.target.value ? Number(event.target.value) : null)}>
                <option value="">All Tags</option>
                {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
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
                onTagFilter={setTagFilter}
                onSubtasksChange={updateTodoSubtasks}
                onError={setError}
              />
              <TodoSection
                title="Pending"
                todos={sections.pending}
                busyId={busyId}
                onToggle={(todo, completed) => void updateTodo(todo.id, { completed })}
                onEdit={startEditing}
                onDelete={(todo) => void deleteTodo(todo)}
                onTagFilter={setTagFilter}
                onSubtasksChange={updateTodoSubtasks}
                onError={setError}
              />
              <TodoSection
                title="Completed"
                todos={sections.completed}
                busyId={busyId}
                onToggle={(todo, completed) => void updateTodo(todo.id, { completed })}
                onEdit={startEditing}
                onDelete={(todo) => void deleteTodo(todo)}
                onTagFilter={setTagFilter}
                onSubtasksChange={updateTodoSubtasks}
                onError={setError}
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
              <TagSelector tags={tags} selected={editTagIds}
                onChange={setEditTagIds} disabled={busyId !== null} />
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
      {managingTags && <ManageTags tags={tags} onSave={saveTag} onDelete={deleteTag}
        onClose={() => setManagingTags(false)} />}
    </main>
  );
}
