'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useEffect, useState } from 'react';

export default function PasskeysPage() {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load the signed-in account.');
        const result = await response.json();
        setUsername(result.user.username);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Unable to load the account.');
      });
  }, []);

  async function addPasskey() {
    setBusy(true);
    setMessage(null);
    try {
      const optionsResponse = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error ?? 'Unable to begin passkey registration.');
      const response = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, response }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(result.error ?? 'Passkey registration failed.');
      setMessage('Passkey added to your account.');
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Passkey prompt cancelled. You can try again when ready.'
          : error instanceof Error
            ? error.message
            : 'Passkey registration failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Manage passkeys</h1>
        <p className="muted">
          Add another device so you have an additional way to sign in as{' '}
          <strong>{username || 'your account'}</strong>.
        </p>
        <div className="actions">
          <button disabled={busy || !username} onClick={() => void addPasskey()}>
            {busy ? 'Waiting for passkey…' : 'Add another passkey'}
          </button>
        </div>
        {message && (
          <p className={message.startsWith('Passkey added') ? 'alert success' : 'alert'} role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
