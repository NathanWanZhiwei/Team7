import { jwtVerify, SignJWT } from 'jose';

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Session {
  userId: number;
  username: string;
}

export const SESSION_COOKIE = 'todo_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  }
  return new TextEncoder().encode(secret);
}

export function assertSessionSecret(): void {
  getSessionSecret();
}

export async function signSession(user: User): Promise<string> {
  return new SignJWT({ userId: user.id, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  const secret = getSessionSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });
    if (
      typeof payload.userId !== 'number' ||
      !Number.isSafeInteger(payload.userId) ||
      typeof payload.username !== 'string'
    ) {
      return null;
    }
    return { userId: payload.userId, username: payload.username };
  } catch (error) {
    return null;
  }
}
