export type ApiRateLimitScope = 'auth' | 'read' | 'write';

export const API_RATE_LIMITS: Record<
  ApiRateLimitScope,
  { requests: number; windowMs: number }
> = {
  auth: { requests: 10, windowMs: 10 * 60 * 1000 },
  read: { requests: 120, windowMs: 60 * 1000 },
  write: { requests: 60, windowMs: 60 * 1000 },
};

export function getRateLimitWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function getRateLimitRetryAfter(
  now: number,
  windowStart: number,
  windowMs: number,
): number {
  return Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
}
