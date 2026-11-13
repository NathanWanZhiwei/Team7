import Database from 'better-sqlite3';
import { join } from 'node:path';
import { HOLIDAYS_SCHEMA, HOLIDAY_YEARS, seedHolidays } from '../lib/holidays';

const db = new Database(process.env.TODO_DATABASE_PATH ?? join(process.cwd(), 'todos.db'));
try {
  db.exec(HOLIDAYS_SCHEMA);
  const inserted = seedHolidays(db);
  process.stdout.write(`Seeded ${inserted} Singapore holiday dates (${HOLIDAY_YEARS}).\n`);
} finally {
  db.close();
}
