'use client';

import { useCallback, useEffect, useState } from 'react';

interface ReminderTodo {
  id: number;
  title: string;
  due_date: string;
}

const dueDateFormatter = new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Singapore',
});

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isSupported = 'Notification' in window;
    setSupported(isSupported);
    if (isSupported) setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setError('This browser does not support notifications.');
      return;
    }
    try {
      setPermission(await Notification.requestPermission());
      setError(null);
    } catch (permissionError) {
      setError(
        permissionError instanceof Error
          ? permissionError.message
          : 'Could not request notification permission.',
      );
    }
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;

    let active = true;
    let polling = false;
    async function poll() {
      if (!active || polling) return;
      if (Notification.permission !== 'granted') {
        setPermission(Notification.permission);
        return;
      }

      polling = true;
      try {
        const response = await fetch('/api/notifications/check', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Notification check failed (${response.status})`);
        const payload = (await response.json()) as { data?: ReminderTodo[] };
        if (!Array.isArray(payload.data)) {
          throw new Error('Notification check returned an invalid response.');
        }

        for (const todo of payload.data) {
          if (!active || Notification.permission !== 'granted') break;
          new Notification(todo.title, {
            body: `Due ${dueDateFormatter.format(new Date(todo.due_date))}`,
            tag: `todo-${todo.id}`,
          });
          const markResponse = await fetch(`/api/todos/${todo.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_notification_sent: new Date().toISOString() }),
          });
          if (!markResponse.ok) {
            throw new Error(`Could not record notification for todo ${todo.id}.`);
          }
        }
        if (active) setError(null);
      } catch (pollError) {
        if (active) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : 'Could not check for due notifications.',
          );
        }
      } finally {
        polling = false;
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [permission]);

  return { permission, requestPermission, supported, error };
}
