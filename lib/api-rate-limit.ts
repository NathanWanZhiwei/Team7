import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiRateLimitDB } from './db';
import {
  API_RATE_LIMITS,
  getRateLimitRetryAfter,
  getRateLimitWindowStart,
  type ApiRateLimitScope,
} from './api-rate-limit-policy';

export { API_RATE_LIMITS, type ApiRateLimitScope } from './api-rate-limit-policy';

function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedIp || 'unknown';
}

function hashIdentity(identity: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  }
  return createHmac('sha256', secret).update(identity).digest('hex');
}

export function checkApiRateLimit(
  request: NextRequest,
  scope: ApiRateLimitScope,
  userId?: number,
  now = Date.now(),
): NextResponse | null {
  const effectiveScope = userId === undefined ? 'auth' : scope;
  const identity =
    effectiveScope === 'auth' ? `ip:${getClientIp(request)}` : `user:${userId}`;
  const subjectHash = hashIdentity(identity);
  const policy = API_RATE_LIMITS[effectiveScope];
  const windowStart = getRateLimitWindowStart(now, policy.windowMs);
  const requestCount = apiRateLimitDB.consume(subjectHash, effectiveScope, windowStart, now);

  if (requestCount <= policy.requests) return null;

  const retryAfter = getRateLimitRetryAfter(now, windowStart, policy.windowMs);
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(retryAfter),
      },
    },
  );
}
