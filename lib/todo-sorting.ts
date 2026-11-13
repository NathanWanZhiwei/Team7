import type { Todo } from './db';
import { PRIORITY_ORDER } from './priority';

export interface TodoSections {
  overdue: Todo[];
  pending: Todo[];
  completed: Todo[];
}

export function compareTodos(a: Todo, b: Todo): number {
  const priorityDifference = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDifference !== 0) return priorityDifference;

  const aDue = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
  const bDue = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  return Date.parse(b.created_at) - Date.parse(a.created_at);
}

export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodos);
}

export function sectionTodos(todos: Todo[], now = new Date()): TodoSections {
  const nowMs = now.getTime();
  const incomplete = todos.filter((todo) => !todo.completed);
  const overdue = incomplete.filter(
    (todo) => todo.due_date !== null && Date.parse(todo.due_date) < nowMs,
  );
  const pending = incomplete.filter(
    (todo) => todo.due_date === null || Date.parse(todo.due_date) >= nowMs,
  );
  const completed = todos
    .filter((todo) => todo.completed)
    .sort(
      (a, b) =>
        Date.parse(b.updated_at ?? b.created_at) -
        Date.parse(a.updated_at ?? a.created_at),
    );

  return {
    overdue: sortTodos(overdue),
    pending: sortTodos(pending),
    completed,
  };
}
