import { isoBase64URL } from '@simplewebauthn/server/helpers';

export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  rpOrigin: string;
}

export function getWebAuthnConfig(): WebAuthnConfig {
  const { RP_ID, RP_ORIGIN } = process.env;
  if (!RP_ID || !RP_ORIGIN) {
    throw new Error('RP_ID and RP_ORIGIN must be configured');
  }
  let origin: URL;
  try {
    origin = new URL(RP_ORIGIN);
  } catch {
    throw new Error('RP_ORIGIN must be a valid origin URL');
  }
  if (origin.origin !== RP_ORIGIN || origin.hostname !== RP_ID) {
    throw new Error('RP_ORIGIN must be an origin whose hostname matches RP_ID');
  }
  return {
    rpName: process.env.RP_NAME?.trim() || 'Todo App',
    rpID: RP_ID,
    rpOrigin: origin.origin,
  };
}

export function isValidUsername(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    /^[a-zA-Z0-9._-]{3,32}$/.test(value)
  );
}

export function normalizeCredentialId(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = isoBase64URL.toBuffer(value);
    return bytes.byteLength > 0 ? isoBase64URL.fromBuffer(bytes) : null;
  } catch {
    return null;
  }
}
