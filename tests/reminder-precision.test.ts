import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { test } from 'node:test';
import { DUE_REMINDERS_QUERY } from '../lib/reminder-query';

test('reminders do not appear before a fractional-second trigger', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, completed INTEGER,
        due_date TEXT, priority TEXT, is_recurring INTEGER, recurrence_pattern TEXT,
        reminder_minutes INTEGER, last_notification_sent TEXT, reminder_revision INTEGER, created_at TEXT, updated_at TEXT
      );
      INSERT INTO todos VALUES (
        1, 1, 'Timed reminder', 0, '2026-01-02T00:05:00.500+08:00',
        'medium', 0, NULL, 60, NULL, 0, '2026-01-01', NULL
      );
    `);
    const query = db.prepare(DUE_REMINDERS_QUERY);
    assert.deepEqual(query.all(1, '2026-01-01T23:05:00.499+08:00'), []);
    assert.equal(query.all(1, '2026-01-01T23:05:00.500+08:00').length, 1);
  } finally {
    db.close();
  }
});
