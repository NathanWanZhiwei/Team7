'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Holiday, Todo } from '@/lib/db';
import {
  formatMonth,
  generateCalendarGrid,
  groupCalendarTodos,
  parseMonthParam,
  shiftMonth,
  type CalendarMonth,
} from '@/lib/calendar';
import { HOLIDAY_YEARS } from '@/lib/holidays';
import { requestJson } from '@/lib/client-api';
import { getSingaporeNow, toSingaporeParts } from '@/lib/timezone';
import { LogoutButton } from './logout-button';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const priorityLabels = { high: 'High', medium: 'Medium', low: 'Low' };
const maxVisibleTodos = 3;

function DayTodosModal({ date, todos, holiday, onClose }: {
  date: string;
  todos: Todo[];
  holiday?: Holiday;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className="todo-modal calendar-day-modal"
      aria-labelledby="calendar-day-heading" onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <h2 id="calendar-day-heading">Todos for {date}</h2>
      {holiday && <p className="calendar-holiday-detail">{holiday.name}</p>}
      {todos.length === 0 ? <p className="muted">No todos due on this day.</p> : (
        <ul className="calendar-day-todos">
          {todos.map((todo) => (
            <li key={todo.id}>
              <input type="checkbox" checked={todo.completed} disabled aria-label={`Completed: ${todo.title}`} />
              <span className={todo.completed ? 'calendar-completed' : ''}>{todo.title}</span>
              <span className={`priority-badge priority-badge--${todo.priority}`}>{priorityLabels[todo.priority]}</span>
              <span className="muted">{todo.completed ? 'Completed' : 'Incomplete'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Read-only summary. Use List to create or edit todos.</p>
      <button type="button" className="secondary" onClick={onClose}>Close</button>
    </dialog>
  );
}

export function CalendarView({ username }: { username: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { year, month } = parseMonthParam(params.get('month'));
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void requestJson<Todo[]>('/api/todos', { signal: controller.signal })
      .then(setTodos)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setTodoError(error instanceof Error ? error.message : 'Could not load todos');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingTodos(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setHolidayError(null);
    setHolidays([]);
    void requestJson<{ holidays: Holiday[] }>(
      `/api/holidays?year=${year}&month=${month}`, { signal: controller.signal },
    )
      .then((payload) => setHolidays(payload.holidays))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setHolidayError(error instanceof Error ? error.message : 'Could not load holidays');
        }
      });
    return () => controller.abort();
  }, [year, month]);

  const grid = generateCalendarGrid(year, month);
  const todosByDate = useMemo(() => groupCalendarTodos(todos), [todos]);
  const holidaysByDate = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday])), [holidays]);
  const title = `${months[month - 1]} ${year}`;

  function navigate(target: CalendarMonth) {
    setSelectedDate(null);
    router.replace(`/calendar?month=${encodeURIComponent(formatMonth(target))}`, { scroll: false });
  }

  return (
    <main className="todo-page calendar-page">
      <div className="todo-shell">
        <header className="todo-header">
          <div>
            <p className="todo-eyebrow">Personal workspace</p>
            <h1>Calendar</h1>
            <p className="muted">Signed in as <strong>{username}</strong></p>
          </div>
          <nav className="todo-header-actions" aria-label="View navigation">
            <Link href="/">List</Link>
            <Link href="/settings/passkeys">Manage passkeys</Link>
            <LogoutButton />
          </nav>
        </header>
        <p className="muted">
          All due-dated todos, in Singapore time. List filters do not apply.
          {' '}Singapore public holidays: {HOLIDAY_YEARS}; other years are not populated.
          {' '}In-lieu dates apply when Sunday is your rest day.
        </p>
        {loadingTodos && <p role="status">Loading todos...</p>}
        {todoError && <p className="todo-error" role="alert">Could not load todos: {todoError}</p>}
        {holidayError && <p className="todo-error" role="alert">Could not load holidays: {holidayError}</p>}
        <section aria-labelledby="calendar-month-heading">
          <div className="calendar-controls">
            <h2 id="calendar-month-heading" aria-live="polite">{title}</h2>
            <div className="actions">
              <button type="button" aria-label="Previous month" onClick={() => navigate(shiftMonth({ year, month }, -1))}>
                <span aria-hidden="true">&lt;</span>
              </button>
              <button type="button" onClick={() => {
                const current = toSingaporeParts(getSingaporeNow());
                navigate({ year: current.year, month: current.month });
              }}>Today</button>
              <button type="button" aria-label="Next month" onClick={() => navigate(shiftMonth({ year, month }, 1))}>
                <span aria-hidden="true">&gt;</span>
              </button>
            </div>
          </div>
          <p className="calendar-legend">
            <span className="priority-badge priority-badge--high">High</span>
            <span className="priority-badge priority-badge--medium">Medium</span>
            <span className="priority-badge priority-badge--low">Low</span>
            <span>Completed todos are struck through. Select a day for details.</span>
          </p>
          <table className="calendar-grid" aria-label={`${title} calendar`}>
            <thead>
              <tr>{weekdays.map((day) => <th key={day} scope="col">{day}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, week) => (
                <tr key={week}>
                  {grid.slice(week * 7, week * 7 + 7).map((day) => {
                    const items = todosByDate.get(day.date) ?? [];
                    const holiday = holidaysByDate.get(day.date);
                    return (
                      <td key={day.date}>
                        <button type="button" data-date={day.date}
                          className={[
                            'calendar-cell', day.isCurrentMonth ? '' : 'calendar-cell--adjacent',
                            day.isToday ? 'calendar-cell--today' : '',
                            day.isPast && day.isCurrentMonth ? 'calendar-cell--past' : '',
                            day.isWeekend ? 'calendar-cell--weekend' : '',
                          ].filter(Boolean).join(' ')}
                          aria-current={day.isToday ? 'date' : undefined}
                          aria-label={`${day.date}, ${items.length} todos${holiday ? `, ${holiday.name}` : ''}`}
                          onClick={() => setSelectedDate(day.date)}
                        >
                          <span className="calendar-date">
                            {Number(day.date.slice(-2))}
                            {items.length > 0 && <span className="calendar-count" aria-hidden="true">{items.length}</span>}
                          </span>
                          {holiday && <span className="calendar-holiday" title={holiday.name}>{holiday.name}</span>}
                          {items.slice(0, maxVisibleTodos).map((todo) => (
                            <span key={todo.id} title={`${todo.title} (${priorityLabels[todo.priority]}, ${todo.completed ? 'Completed' : 'Incomplete'})`}
                              className={`calendar-todo priority-badge--${todo.priority}${todo.completed ? ' calendar-completed' : ''}`}>
                              {todo.title}
                            </span>
                          ))}
                          {items.length > maxVisibleTodos && <span className="calendar-overflow">+{items.length - maxVisibleTodos} more</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {selectedDate && <DayTodosModal date={selectedDate}
          todos={todosByDate.get(selectedDate) ?? []} holiday={holidaysByDate.get(selectedDate)}
          onClose={() => setSelectedDate(null)} />}
      </div>
    </main>
  );
}
