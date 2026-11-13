export const REMINDER_OPTIONS = [
  { minutes: 15, label: '15 minutes before', abbreviation: '15m' },
  { minutes: 30, label: '30 minutes before', abbreviation: '30m' },
  { minutes: 60, label: '1 hour before', abbreviation: '1h' },
  { minutes: 120, label: '2 hours before', abbreviation: '2h' },
  { minutes: 1440, label: '1 day before', abbreviation: '1d' },
  { minutes: 2880, label: '2 days before', abbreviation: '2d' },
  { minutes: 10080, label: '1 week before', abbreviation: '1w' },
] as const;

export type ReminderMinutes = (typeof REMINDER_OPTIONS)[number]['minutes'];

export const REMINDER_LABELS: Record<ReminderMinutes, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
};

export function isReminderMinutes(value: unknown): value is ReminderMinutes {
  return REMINDER_OPTIONS.some((option) => option.minutes === value);
}

export function hasReminderConfigurationChanged(
  current: { due_date: string | null; reminder_minutes: number | null },
  update: { due_date?: string | null; reminder_minutes?: number | null },
): boolean {
  return (
    (update.due_date !== undefined && update.due_date !== current.due_date) ||
    (update.reminder_minutes !== undefined &&
      update.reminder_minutes !== current.reminder_minutes)
  );
}
