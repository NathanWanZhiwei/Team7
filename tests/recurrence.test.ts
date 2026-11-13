import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateNextDueDate } from '../lib/recurrence';

test('advances daily and weekly recurrences in Singapore time', () => {
  assert.equal(
    calculateNextDueDate('2025-11-10T14:00', 'daily'),
    '2025-11-11T14:00:00.000+08:00',
  );
  assert.equal(
    calculateNextDueDate('2025-11-10T14:00', 'weekly'),
    '2025-11-17T14:00:00.000+08:00',
  );
  assert.equal(
    calculateNextDueDate('2025-11-10T06:00:00.123Z', 'daily'),
    '2025-11-11T14:00:00.123+08:00',
  );
  assert.equal(
    calculateNextDueDate('0099-12-31T14:00', 'daily'),
    '0100-01-01T14:00:00.000+08:00',
  );
});

test('advances monthly recurrences and clamps month-end dates', () => {
  assert.equal(
    calculateNextDueDate('2025-06-15T09:00', 'monthly'),
    '2025-07-15T09:00:00.000+08:00',
  );
  assert.equal(
    calculateNextDueDate('2025-01-31T09:00', 'monthly'),
    '2025-02-28T09:00:00.000+08:00',
  );
  assert.equal(
    calculateNextDueDate('2024-01-31T09:00', 'monthly'),
    '2024-02-29T09:00:00.000+08:00',
  );
  assert.equal(
    calculateNextDueDate('2025-12-31T09:00', 'monthly'),
    '2026-01-31T09:00:00.000+08:00',
  );
});

test('advances yearly recurrences and clamps leap days', () => {
  assert.equal(
    calculateNextDueDate('2025-06-15T09:00', 'yearly'),
    '2026-06-15T09:00:00.000+08:00',
  );
  assert.equal(
    calculateNextDueDate('2024-02-29T09:00', 'yearly'),
    '2025-02-28T09:00:00.000+08:00',
  );
});

test('preserves the full Singapore-local time across recurrence patterns', () => {
  for (const pattern of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
    assert.match(
      calculateNextDueDate('2024-12-31T23:59:37.042+08:00', pattern),
      /T23:59:37\.042\+08:00$/,
    );
  }
});
