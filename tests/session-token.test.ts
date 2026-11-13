import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import { signSession, verifySessionToken } from '../lib/session-token';

const secret = randomBytes(32).toString('base64url');
process.env.SESSION_SECRET = secret;

test('signs and verifies a session with its user identity', async () => {
  const token = await signSession({ id: 17, username: 'alex', created_at: '2026-01-01' });
  assert.deepEqual(await verifySessionToken(token), { userId: 17, username: 'alex' });
});

test('rejects a tampered session token', async () => {
  const token = await signSession({ id: 17, username: 'alex', created_at: '2026-01-01' });
  const [header, payload] = token.split('.');
  assert.equal(await verifySessionToken(`${header}.${payload}.${randomBytes(32).toString('base64url')}`), null);
});

test('rejects an expired session token', async () => {
  const token = await new SignJWT({ userId: 17, username: 'alex' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
    .sign(new TextEncoder().encode(secret));
  assert.equal(await verifySessionToken(token), null);
});
