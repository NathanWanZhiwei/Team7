import type { CalendarDay, Todo } from './db';
import { PRIORITY_ORDER } from './priority';
import {
  calendarDateUtc,
  formatCalendarDate,
  formatSingaporeDate,
  fromSingaporeParts,
  getSingaporeNow,
  toSingaporeParts,
} from './timezone';

export interface CalendarMonth {
  year: number;
  month: number;
}

export function formatMonth({ year, month }: CalendarMonth): string {
  return formatCalendarDate(calendarDateUtc(year, month)).slice(0, -3);
}

export function parseMonthParam(raw: string | null, now = getSingaporeNow()): CalendarMonth {
  const match = raw?.match(/^([+-]?\d{4,6})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) {
      try {
        calendarDateUtc(year, month, 42);
        return { year, month };
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
      }
    }
  }
  const { year, month } = toSingaporeParts(now);
  return { year, month };
}

export function shiftMonth(current: CalendarMonth, offset: number): CalendarMonth {
  const date = calendarDateUtc(current.year, current.month + offset);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function generateCalendarGrid(year: number, month: number, now = getSingaporeNow()): CalendarDay[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Invalid calendar month');
  }
  const first = calendarDateUtc(year, month);
  const leadingDays = first.getUTCDay();
  const today = toSingaporeParts(now);
  const todayValue = calendarDateUtc(today.year, today.month, today.day).getTime();
  return Array.from({ length: 42 }, (_, index) => {
    const date = calendarDateUtc(year, month, index - leadingDays + 1);
    return {
      date: formatCalendarDate(date),
      isCurrentMonth: date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month,
      isToday: date.getTime() === todayValue,
      isPast: date.getTime() < todayValue,
      isWeekend: index % 7 === 0 || index % 7 === 6,
    };
  });
}

function localDueTime(value: string): string {
  const parts = toSingaporeParts(value);
  return fromSingaporeParts(parts, parts.hour, parts.minute, parts.second, parts.millisecond);
}

export function groupCalendarTodos(todos: Todo[]): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (todo.due_date === null) continue;
    const date = formatSingaporeDate(todo.due_date);
    groups.set(date, [...(groups.get(date) ?? []), todo]);
  }
  for (const [date, items] of groups) {
    groups.set(date, [...items].sort((a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      localDueTime(a.due_date!).localeCompare(localDueTime(b.due_date!)) ||
      a.id - b.id,
    ));
  }
  return groups;
}
