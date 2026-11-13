import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { TodoApp } from './ui/todo-app';

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <TodoApp userId={session.userId} username={session.username} />;
}
