'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Flow = 'register' | 'login';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Flow | null>(null);

  async function runFlow(flow: Flow) {
    setError(null);
    setBusy(flow);
    try {
      const optionsResponse = await fetch(`/api/auth/${flow}-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error ?? 'Unable to begin passkey flow.');

      const response =
        flow === 'register'
          ? await startRegistration({ optionsJSON: options })
          : await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch(`/api/auth/${flow}-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, response }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(result.error ?? 'Passkey verification failed.');
      router.replace('/');
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'NotAllowedError') {
        setError('Passkey prompt cancelled. You can try again when ready.');
      } else if (cause instanceof Error && /not supported|secure context/i.test(cause.message)) {
        setError('This browser or device does not support passkeys on this connection.');
      } else {
        setError(cause instanceof Error ? cause.message : 'The passkey request failed. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <section className="card" aria-labelledby="login-title">
        <h1 id="login-title">Sign in with a passkey</h1>
        <p className="muted">
          Register with a new username or use a passkey you already registered. Your
          biometric stays on your device.
        </p>
        <label className="field">
          Username
          <input
            autoComplete="username webauthn"
            maxLength={32}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. alex"
            required
          />
        </label>
        <div className="actions">
          <button disabled={busy !== null} onClick={() => void runFlow('register')}>
            {busy === 'register' ? 'Registering…' : 'Register passkey'}
          </button>
          <button
            className="secondary"
            disabled={busy !== null}
            onClick={() => void runFlow('login')}
          >
            {busy === 'login' ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
