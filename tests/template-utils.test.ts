import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTemplateSubtasks, serializeTemplateSubtasks, templateDueDate } from '../lib/template-utils';

test('template subtasks serialize and deserialize in their stored order', () => {
  const subtasks = [
    { title: 'First', position: 0 },
    { title: 'Second', position: 1 },
  ];
  const serialized = serializeTemplateSubtasks(subtasks);
  assert.equal(serialized, '[{"title":"First","position":0},{"title":"Second","position":1}]');
  assert.deepEqual(parseTemplateSubtasks(serialized), subtasks);
  assert.equal(serializeTemplateSubtasks([]), null);
  assert.deepEqual(parseTemplateSubtasks(null), []);
});

test('malformed or invalid template subtask JSON safely produces an empty checklist', () => {
  assert.deepEqual(parseTemplateSubtasks('{'), []);
  assert.deepEqual(parseTemplateSubtasks('[{"title":"","position":0}]'), []);
  assert.deepEqual(parseTemplateSubtasks('[{"title":"First","position":-1}]'), []);
});

test('due date offsets resolve against the supplied instant in Singapore time', () => {
  const now = new Date('2025-12-31T23:30:00.000Z');
  assert.equal(templateDueDate(60, now), '2026-01-01T08:30:00.000+08:00');
  assert.equal(templateDueDate(90, now), '2026-01-01T09:00:00.000+08:00');
  assert.throws(() => templateDueDate(-1, now), RangeError);
});
