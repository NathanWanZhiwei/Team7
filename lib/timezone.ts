export interface SingaporeDateParts {
  year: number;
  month: number;
  day: number;
}

export interface SingaporeDateTimeParts extends SingaporeDateParts {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const singaporeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const singaporeLocalDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:\+08:00)?$/;

function numericPart(
  parts: Intl.DateTimeFormatPart[],
  type: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second',
): number {
  const value = parts.find((part) => part.type === type)?.value;
  const number = Number(value);
  if (!value || !Number.isInteger(number)) {
    throw new RangeError(`Could not read Singapore ${type}`);
  }
  return number;
}

export function toSingaporeParts(value: string | Date): SingaporeDateTimeParts {
  if (typeof value === 'string') {
    const match = singaporeLocalDateTimePattern.exec(value);
    if (match) {
      const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction] =
        match;
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
      const hour = Number(hourText);
      const minute = Number(minuteText);
      const second = Number(secondText ?? '0');
      const millisecond = Number((fraction ?? '').padEnd(3, '0'));
      const calendarDate = new Date(0);
      calendarDate.setUTCFullYear(year, month - 1, day);
      calendarDate.setUTCHours(hour, minute, second, millisecond);
      if (
        year < 1 ||
        month < 1 ||
        month > 12 ||
        calendarDate.getUTCFullYear() !== year ||
        calendarDate.getUTCMonth() !== month - 1 ||
        calendarDate.getUTCDate() !== day ||
        hour > 23 ||
        minute > 59 ||
        second > 59
      ) {
        throw new RangeError('Invalid Singapore-local date-time');
      }
      return { year, month, day, hour, minute, second, millisecond };
    }
  }

  const timestamp =
    value instanceof Date
      ? value.getTime()
      : Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}+08:00`);
  if (!Number.isFinite(timestamp)) throw new RangeError('Invalid date-time');

  const date = new Date(timestamp);
  const parts = singaporeFormatter.formatToParts(date);
  return {
    year: numericPart(parts, 'year'),
    month: numericPart(parts, 'month'),
    day: numericPart(parts, 'day'),
    hour: numericPart(parts, 'hour'),
    minute: numericPart(parts, 'minute'),
    second: numericPart(parts, 'second'),
    millisecond: date.getUTCMilliseconds(),
  };
}

export function fromSingaporeParts(
  date: SingaporeDateParts,
  hour: number,
  minute: number,
  second = 0,
  millisecond = 0,
): string {
  if (
    !Number.isInteger(date.year) ||
    date.year < 1 ||
    date.year > 9999 ||
    !Number.isInteger(date.month) ||
    !Number.isInteger(date.day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isInteger(millisecond) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    millisecond < 0 ||
    millisecond > 999
  ) {
    throw new RangeError('Invalid Singapore date-time parts');
  }

  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(date.year, date.month - 1, date.day);
  calendarDate.setUTCHours(hour, minute, second, millisecond);
  if (
    calendarDate.getUTCFullYear() !== date.year ||
    calendarDate.getUTCMonth() !== date.month - 1 ||
    calendarDate.getUTCDate() !== date.day
  ) {
    throw new RangeError('Invalid Singapore calendar date');
  }

  const pad = (part: number, length = 2) => String(part).padStart(length, '0');
  const dateText = `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
  const timeText = `${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millisecond, 3)}`;
  return `${dateText}T${timeText}+08:00`;
}
