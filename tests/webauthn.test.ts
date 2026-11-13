import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidUsername, normalizeCredentialId } from '../lib/webauthn';

test('accepts usernames in the documented format and bounds', () => {
  assert.equal(isValidUsername('todo.user-7'), true);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(isValidUsername(' user '), false);
  assert.equal(isValidUsername('a'.repeat(33)), false);
  assert.equal(isValidUsername('user/name'), false);
});

test('normalizes valid WebAuthn credential IDs and rejects malformed IDs', () => {
  assert.equal(normalizeCredentialId('AQIDBA'), 'AQIDBA');
  assert.equal(normalizeCredentialId('invalid/id'), null);
  assert.equal(normalizeCredentialId('!'), null);
  assert.equal(normalizeCredentialId(''), null);
});
