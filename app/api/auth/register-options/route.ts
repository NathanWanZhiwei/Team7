import { randomBytes } from 'node:crypto';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
import { getSession } from '@/lib/auth';
import { authenticatorDB, challengeDB, userDB } from '@/lib/db';
import { assertSessionSecret } from '@/lib/session-token';
import { getWebAuthnConfig, isValidUsername } from '@/lib/webauthn';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rateLimitResponse = checkApiRateLimit(request, 'auth');
  if (rateLimitResponse) return rateLimitResponse;

  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!isValidUsername(body.username)) {
    return NextResponse.json({ error: 'Enter a username using 3–32 letters, numbers, dots, underscores, or hyphens.' }, { status: 400 });
  }

  const username = body.username.toLowerCase();
  const existingUser = userDB.findByUsername(username);

  try {
    assertSessionSecret();
    const session = await getSession();
    if (existingUser && session?.userId !== existingUser.id) {
      return NextResponse.json({ error: 'That username is already registered.' }, { status: 409 });
    }
    const { rpName, rpID } = getWebAuthnConfig();
    const userHandle = Uint8Array.from(
      existingUser?.webauthn_user_handle ?? randomBytes(32),
    );
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: username,
      userID: userHandle,
      attestationType: 'none',
      excludeCredentials: existingUser
        ? authenticatorDB.findByUserId(existingUser.id).map(({ credential_id }) => ({
            id: credential_id,
          }))
        : [],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challengeDB.save({
      username,
      purpose: 'registration',
      challenge: options.challenge,
      user_id: existingUser?.id ?? null,
      user_handle: Buffer.from(userHandle),
    });
    return NextResponse.json(options);
  } catch (error) {
    console.error('Unable to create registration options', error);
    return NextResponse.json({ error: 'Passkey registration is not configured correctly.' }, { status: 500 });
  }
}
