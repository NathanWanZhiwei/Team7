import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTag, validateTagIds, tagBackground } from '../lib/tag-validation';
import { validateCreateTodo, validateUpdateTodo } from '../lib/todo-validation';

test('tags require trimmed names and default only omitted colors', () => {
  assert.deepEqual(validateTag({ name: ' Work ' }), {
    value: { name: 'Work', color: '#3B82F6' },
  });
  for (const body of [null, [], { name: ' ' }, { name: 7 }, { name: 'Work', color: '' },
    { name: 'Work', color: null }, { name: 'Work', color: 'red' },
    { name: 'Work', color: '#ZZZ' }, { name: 'Work', user_id: 1 }]) {
    assert.ok('error' in validateTag(body));
  }
  assert.deepEqual(validateTag({ name: 'Work', color: '#abcdef' }), {
    value: { name: 'Work', color: '#abcdef' },
  });
});

test('tag updates allow partial changes but reject empty patches', () => {
  assert.deepEqual(validateTag({ color: '#123456' }, true), { value: { color: '#123456' } });
  assert.ok('error' in validateTag({}, true));
  assert.ok('error' in validateTag({ name: ' ' }, true));
});

test('tag selections are positive safe integer arrays without duplicates', () => {
  assert.deepEqual(validateTagIds([1, 2, 1]), { value: [1, 2] });
  assert.deepEqual(validateTagIds([]), { value: [] });
  for (const ids of [null, '1', [0], [-1], [1.5], ['1'], [Number.MAX_SAFE_INTEGER + 1]]) {
    assert.ok('error' in validateTagIds(ids));
  }
  assert.deepEqual(validateCreateTodo({ title: 'Plan', tag_ids: [1, 2] }), {
    value: { title: 'Plan', priority: 'medium', tag_ids: [1, 2] },
  });
  assert.deepEqual(validateUpdateTodo({ tag_ids: [] }), { value: { tag_ids: [] } });
  assert.ok('error' in validateUpdateTodo({ tag_ids: [0] }));
});

test('white pill text has at least 4.5:1 contrast on every computed background', () => {
  assert.throws(() => tagBackground('red'), /Invalid tag color/);
  for (const color of ['#FFFFFF', '#FFFF00', '#3B82F6', '#000000', '#abcdef']) {
    const result = tagBackground(color);
    const channels = result.slice(1).match(/../g)!.map((hex) => {
      const channel = parseInt(hex, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    assert.ok(1.05 / (luminance + 0.05) >= 4.5, color);
  }
});
