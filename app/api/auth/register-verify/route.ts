import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession } from '@/lib/auth';
import { authenticatorDB, challengeDB, registrationDB, userDB } from '@/lib/db';
import { assertSessionSecret } from '@/lib/session-token';
import { getWebAuthnConfig, isValidUsername, normalizeCredentialId } from '@/lib/webauthn';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { username?: unknown; response?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (
    !isValidUsername(body.username) ||
    !body.response ||
    typeof body.response !== 'object' ||
    !('id' in body.response) ||
    normalizeCredentialId(body.response.id) === null
  ) {
    return NextResponse.json({ error: 'Invalid registration response' }, { status: 400 });
  }

  const username = body.username.toLowerCase();
  try {
    assertSessionSecret();
  } catch (error) {
    console.error('Session configuration is invalid', error);
    return NextResponse.json({ error: 'Authentication is not configured correctly.' }, { status: 500 });
  }
  const challenge = challengeDB.consume(username, 'registration');
  if (!challenge || !challenge.user_handle) {
    return NextResponse.json({ error: 'Registration expired. Please try again.' }, { status: 400 });
  }

  const session = await getSession();
  if (challenge.user_id !== null && session?.userId !== challenge.user_id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (challenge.user_id === null && userDB.findByUsername(username)) {
    return NextResponse.json({ error: 'That username is already registered.' }, { status: 409 });
  }

  try {
    const { rpID, rpOrigin } = getWebAuthnConfig();
    const verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Passkey verification failed.' }, { status: 401 });
    }

    const { credential } = verification.registrationInfo;
    const credentialId = normalizeCredentialId(credential.id);
    if (!credentialId) {
      return NextResponse.json({ error: 'Passkey returned an invalid credential.' }, { status: 400 });
    }
    const existingCredential = authenticatorDB.findByCredentialId(credentialId);
    if (existingCredential) {
      return NextResponse.json({ error: 'This passkey is already registered.' }, { status: 409 });
    }

    const user =
      challenge.user_id === null
        ? registrationDB.createUserAndAuthenticator(
            username,
            challenge.user_handle,
            credentialId,
            credential.publicKey,
            credential.counter ?? 0,
          )
        : registrationDB.addAuthenticator(
            challenge.user_id,
            credentialId,
            credential.publicKey,
            credential.counter ?? 0,
          );
    await createSession(user);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Registration verification failed', error);
    return NextResponse.json({ error: 'Passkey registration failed.' }, { status: 401 });
  }
}
