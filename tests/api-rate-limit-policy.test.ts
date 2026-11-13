import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  API_RATE_LIMITS,
  getRateLimitRetryAfter,
  getRateLimitWindowStart,
} from '../lib/api-rate-limit-policy';

test('exposes the approved authentication, read, and write rate limits', () => {
  assert.deepEqual(API_RATE_LIMITS, {
    auth: { requests: 10, windowMs: 600_000 },
    read: { requests: 120, windowMs: 60_000 },
    write: { requests: 60, windowMs: 60_000 },
  });
});

test('calculates fixed-window boundaries and retry delay', () => {
  const now = 125_500;
  const windowStart = getRateLimitWindowStart(now, 60_000);
  assert.equal(windowStart, 120_000);
  assert.equal(getRateLimitRetryAfter(now, windowStart, 60_000), 55);
  assert.equal(getRateLimitRetryAfter(179_999, 120_000, 60_000), 1);
});
