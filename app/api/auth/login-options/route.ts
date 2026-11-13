import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-rate-limit';
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
    return NextResponse.json({ error: 'Enter a valid username.' }, { status: 400 });
  }

  const username = body.username.toLowerCase();
  const user = userDB.findByUsername(username);
  const authenticators = user ? authenticatorDB.findByUserId(user.id) : [];
  if (!user || authenticators.length === 0) {
    return NextResponse.json({ error: 'Unable to start login. Check the username or register a passkey.' }, { status: 400 });
  }

  try {
    assertSessionSecret();
    const { rpID } = getWebAuthnConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: authenticators.map(({ credential_id }) => ({ id: credential_id })),
      userVerification: 'preferred',
    });
    challengeDB.save({
      username,
      purpose: 'authentication',
      challenge: options.challenge,
      user_id: user.id,
      user_handle: null,
    });
    return NextResponse.json(options);
  } catch (error) {
    console.error('Unable to create authentication options', error);
    return NextResponse.json({ error: 'Passkey login is not configured correctly.' }, { status: 500 });
  }
}
