import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { authenticatorDB, challengeDB, userDB } from '@/lib/db';
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
    return NextResponse.json({ error: 'Invalid authentication response' }, { status: 400 });
  }

  const username = body.username.toLowerCase();
  const challenge = challengeDB.consume(username, 'authentication');
  if (!challenge || challenge.user_id === null) {
    return NextResponse.json({ error: 'Login expired. Please try again.' }, { status: 401 });
  }
  const credentialId = normalizeCredentialId(body.response.id);
  if (!credentialId) {
    return NextResponse.json({ error: 'Invalid passkey credential.' }, { status: 400 });
  }
  const authenticator = authenticatorDB.findByCredentialId(credentialId);
  const user = userDB.findById(challenge.user_id);
  if (
    !authenticator ||
    !user ||
    user.username.toLowerCase() !== username ||
    authenticator.user_id !== user.id
  ) {
    return NextResponse.json({ error: 'Passkey not recognized.' }, { status: 401 });
  }

  try {
    const { rpID, rpOrigin } = getWebAuthnConfig();
    const verification = await verifyAuthenticationResponse({
      response: body.response as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credential_id,
        publicKey: Uint8Array.from(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
      },
    });
    if (!verification.verified) {
      return NextResponse.json({ error: 'Passkey verification failed.' }, { status: 401 });
    }

    authenticatorDB.updateCounter(
      authenticator.id,
      verification.authenticationInfo.newCounter ?? 0,
    );
    await createSession(user);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Authentication verification failed', error);
    return NextResponse.json({ error: 'Passkey verification failed.' }, { status: 401 });
  }
}
