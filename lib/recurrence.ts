import type { RecurrencePattern } from './db';
import { fromSingaporeParts, toSingaporeParts } from './timezone';

function dateAtUtc(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function daysInMonth(year: number, month: number): number {
  return dateAtUtc(year, month, 0).getUTCDate();
}

function addDays(
  date: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const next = dateAtUtc(date.year, date.month - 1, date.day + days);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern,
): string {
  const { year, month, day, hour, minute, second, millisecond } =
    toSingaporeParts(currentDueDate);
  let nextDate: { year: number; month: number; day: number };

  switch (pattern) {
    case 'daily':
      nextDate = addDays({ year, month, day }, 1);
      break;
    case 'weekly':
      nextDate = addDays({ year, month, day }, 7);
      break;
    case 'monthly': {
      const targetMonth = month === 12 ? 1 : month + 1;
      const targetYear = month === 12 ? year + 1 : year;
      nextDate = {
        year: targetYear,
        month: targetMonth,
        day: Math.min(day, daysInMonth(targetYear, targetMonth)),
      };
      break;
    }
    case 'yearly': {
      const targetYear = year + 1;
      nextDate = {
        year: targetYear,
        month,
        day: Math.min(day, daysInMonth(targetYear, month)),
      };
      break;
    }
    default: {
      const unsupportedPattern: never = pattern;
      throw new Error(`Unsupported recurrence pattern: ${unsupportedPattern}`);
    }
  }

  return fromSingaporeParts(nextDate, hour, minute, second, millisecond);
}
