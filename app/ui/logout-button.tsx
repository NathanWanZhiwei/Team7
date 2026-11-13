'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('The server could not end this session.');
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="secondary" disabled={busy} onClick={() => void logout()}>
        {busy ? 'Signing out…' : 'Log out'}
      </button>
      {error && <span className="alert" role="alert">{error}</span>}
    </>
  );
}
