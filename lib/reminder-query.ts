export const DUE_REMINDERS_QUERY = `
  SELECT id, user_id, title, completed, due_date, priority, is_recurring,
    recurrence_pattern, reminder_minutes, last_notification_sent, created_at, updated_at
  FROM todos
  WHERE user_id = ?
    AND completed = 0
    AND due_date IS NOT NULL
    AND reminder_minutes IN (15, 30, 60, 120, 1440, 2880, 10080)
    AND last_notification_sent IS NULL
    AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime(?)
  ORDER BY due_date, id
`;
