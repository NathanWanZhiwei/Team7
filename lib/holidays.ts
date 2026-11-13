import type Database from 'better-sqlite3';

// Official MOM calendar, including conditional in-lieu dates:
// https://www.mom.gov.sg/employment-practices/public-holidays
export const HOLIDAY_YEARS = '2025-2027';

const holidays: ReadonlyArray<readonly [string, string]> = [
  ['2025-01-01', "New Year's Day"],
  ['2025-01-29', 'Chinese New Year'],
  ['2025-01-30', 'Chinese New Year'],
  ['2025-03-31', 'Hari Raya Puasa'],
  ['2025-04-18', 'Good Friday'],
  ['2025-05-01', 'Labour Day'],
  ['2025-05-03', 'Polling Day'],
  ['2025-05-12', 'Vesak Day'],
  ['2025-06-07', 'Hari Raya Haji'],
  ['2025-08-09', 'National Day'],
  ['2025-10-20', 'Deepavali'],
  ['2025-12-25', 'Christmas Day'],
  ['2026-01-01', "New Year's Day"],
  ['2026-02-17', 'Chinese New Year'],
  ['2026-02-18', 'Chinese New Year'],
  ['2026-03-21', 'Hari Raya Puasa'],
  ['2026-04-03', 'Good Friday'],
  ['2026-05-01', 'Labour Day'],
  ['2026-05-27', 'Hari Raya Haji'],
  ['2026-05-31', 'Vesak Day'],
  ['2026-06-01', 'Vesak Day (in lieu if Sunday is rest day)'],
  ['2026-08-09', 'National Day'],
  ['2026-08-10', 'National Day (in lieu if Sunday is rest day)'],
  ['2026-11-08', 'Deepavali'],
  ['2026-11-09', 'Deepavali (in lieu if Sunday is rest day)'],
  ['2026-12-25', 'Christmas Day'],
  ['2027-01-01', "New Year's Day"],
  ['2027-02-06', 'Chinese New Year'],
  ['2027-02-07', 'Chinese New Year'],
  ['2027-02-08', 'Chinese New Year (in lieu if Sunday is rest day)'],
  ['2027-03-10', 'Hari Raya Puasa'],
  ['2027-03-26', 'Good Friday'],
  ['2027-05-01', 'Labour Day'],
  ['2027-05-17', 'Hari Raya Haji'],
  ['2027-05-20', 'Vesak Day'],
  ['2027-08-09', 'National Day'],
  ['2027-10-28', 'Deepavali'],
  ['2027-12-25', 'Christmas Day'],
];

export const HOLIDAYS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
`;

export function seedHolidays(db: Database.Database): number {
  const insert = db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)');
  return db.transaction(() => holidays.reduce(
    (count, [date, name]) => count + insert.run(date, name).changes, 0,
  )).immediate();
}
