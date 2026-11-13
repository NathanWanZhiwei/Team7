import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateProgress } from '../lib/subtasks';

test('empty and incomplete checklists have zero progress', () => {
  assert.deepEqual(calculateProgress([]), { completed: 0, total: 0, percent: 0 });
  assert.deepEqual(
    calculateProgress([{ completed: false }, { completed: false }]),
    { completed: 0, total: 2, percent: 0 },
  );
});

test('progress counts completed subtasks and rounds to the nearest percent', () => {
  assert.deepEqual(
    calculateProgress(Array.from({ length: 7 }, (_, index) => ({ completed: index < 3 }))),
    { completed: 3, total: 7, percent: 43 },
  );
  assert.deepEqual(
    calculateProgress([{ completed: true }, { completed: false }, { completed: false }]),
    { completed: 1, total: 3, percent: 33 },
  );
  assert.deepEqual(
    calculateProgress([{ completed: true }, { completed: true }, { completed: false }]),
    { completed: 2, total: 3, percent: 67 },
  );
});

test('fully completed checklist reports 100 percent', () => {
  assert.deepEqual(
    calculateProgress([{ completed: true }, { completed: true }]),
    { completed: 2, total: 2, percent: 100 },
  );
});
