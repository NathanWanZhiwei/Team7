import Link from 'next/link';
import { LogoutButton } from './ui/logout-button';
import { getSession } from '@/lib/auth';

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="page">
      <section className="card">
        <div className="topbar">
          <h1>Todo App</h1>
          <LogoutButton />
        </div>
        <p className="muted">
          Signed in as <strong>{session?.username}</strong>. Passkey authentication is ready.
        </p>
        <Link href="/settings/passkeys">Manage passkeys</Link>
      </section>
    </main>
  );
}
