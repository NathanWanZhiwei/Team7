import 'server-only';

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { PRIORITY_ORDER, PRIORITY_VALUES } from './priority';
import { calculateNextDueDate } from './recurrence';
import type { Priority } from './priority';
import type { User } from './session-token';

export { PRIORITY_ORDER, PRIORITY_VALUES };
export type { Priority };

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  created_at: string;
}

interface Challenge {
  username: string;
  purpose: 'registration' | 'authentication';
  challenge: string;
  user_id: number | null;
  user_handle: Buffer | null;
  expires_at: number;
}

export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CreateTodoInput {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {
  completed?: boolean;
}

export interface TodoUpdateResult {
  todo: Todo;
  nextInstance?: Todo;
}

interface TodoRow extends Omit<Todo, 'completed' | 'is_recurring'> {
  completed: number;
  is_recurring: number;
}

const databasePath = join(process.cwd(), 'todos.db');

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    webauthn_user_handle BLOB NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS authenticators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    credential_public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);

  CREATE TABLE IF NOT EXISTS auth_challenges (
    username TEXT NOT NULL COLLATE NOCASE,
    purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
    challenge TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_handle BLOB,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (username, purpose)
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1)),
    recurrence_pattern TEXT CHECK (
      recurrence_pattern IS NULL OR recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')
    ),
    reminder_minutes INTEGER CHECK (reminder_minutes IS NULL OR reminder_minutes >= 0),
    last_notification_sent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
`);

const userByUsername = db.prepare(
  'SELECT id, username, created_at, webauthn_user_handle FROM users WHERE username = ?',
);
const userById = db.prepare(
  'SELECT id, username, created_at, webauthn_user_handle FROM users WHERE id = ?',
);
const authenticatorByCredential = db.prepare(
  'SELECT id, user_id, credential_id, credential_public_key, counter, created_at FROM authenticators WHERE credential_id = ?',
);
const authenticatorsByUser = db.prepare(
  'SELECT id, user_id, credential_id, credential_public_key, counter, created_at FROM authenticators WHERE user_id = ? ORDER BY id',
);
const todoSelect = `
  SELECT id, user_id, title, completed, due_date, priority, is_recurring,
    recurrence_pattern, reminder_minutes, last_notification_sent, created_at, updated_at
  FROM todos
`;

function mapTodo(row: TodoRow | undefined): Todo | undefined {
  if (!row) return undefined;
  return {
    ...row,
    completed: row.completed === 1,
    is_recurring: row.is_recurring === 1,
  };
}

export interface AuthUser extends User {
  webauthn_user_handle: Buffer;
}

export const userDB = {
  findByUsername(username: string): AuthUser | undefined {
    return userByUsername.get(username) as AuthUser | undefined;
  },
  findById(id: number): AuthUser | undefined {
    return userById.get(id) as AuthUser | undefined;
  },
  create(username: string, userHandle: Buffer): AuthUser {
    const result = db
      .prepare('INSERT INTO users (username, webauthn_user_handle) VALUES (?, ?)')
      .run(username, userHandle);
    const user = userDB.findById(Number(result.lastInsertRowid));
    if (!user) throw new Error('User creation did not return a user');
    return user;
  },
};

export const todoDB = {
  create(userId: number, input: CreateTodoInput): Todo {
    const result = db
      .prepare(`
        INSERT INTO todos (
          user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        userId,
        input.title,
        input.due_date ?? null,
        input.priority ?? 'medium',
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern ?? null,
        input.reminder_minutes ?? null,
      );
    const todo = mapTodo(
      db.prepare(`${todoSelect} WHERE id = ? AND user_id = ?`).get(
        Number(result.lastInsertRowid),
        userId,
      ) as TodoRow | undefined,
    );
    if (!todo) throw new Error('Todo creation did not return a todo');
    return todo;
  },
  findAllByUser(userId: number): Todo[] {
    const rows = db
      .prepare(
        `${todoSelect} WHERE user_id = ? ORDER BY due_date IS NULL, due_date, created_at DESC, id DESC`,
      )
      .all(userId) as TodoRow[];
    return rows.map((row) => mapTodo(row)!);
  },
  findByIdForUser(id: number, userId: number): Todo | undefined {
    return mapTodo(
      db.prepare(`${todoSelect} WHERE id = ? AND user_id = ?`).get(id, userId) as
        | TodoRow
        | undefined,
    );
  },
  updateForUser(id: number, userId: number, input: UpdateTodoInput): Todo | undefined {
    const updates: Array<[string, string | number | null]> = [];
    if (input.title !== undefined) updates.push(['title', input.title]);
    if (input.completed !== undefined) updates.push(['completed', input.completed ? 1 : 0]);
    if (input.due_date !== undefined) updates.push(['due_date', input.due_date]);
    if (input.priority !== undefined) updates.push(['priority', input.priority]);
    if (input.is_recurring !== undefined) {
      updates.push(['is_recurring', input.is_recurring ? 1 : 0]);
    }
    if (input.recurrence_pattern !== undefined) {
      updates.push(['recurrence_pattern', input.recurrence_pattern]);
    }
    if (input.reminder_minutes !== undefined) {
      updates.push(['reminder_minutes', input.reminder_minutes]);
    }
    if (updates.length === 0) return this.findByIdForUser(id, userId);

    const assignments = updates.map(([column]) => `${column} = ?`);
    assignments.push("updated_at = datetime('now')");
    const result = db
      .prepare(
        `UPDATE todos SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`,
      )
      .run(...updates.map(([, value]) => value), id, userId);
    if (result.changes === 0) return undefined;
    return this.findByIdForUser(id, userId);
  },
  updateWithRecurrenceForUser(
    id: number,
    userId: number,
    input: UpdateTodoInput,
  ): TodoUpdateResult | undefined {
    const update = db.transaction((): TodoUpdateResult | undefined => {
      const existing = todoDB.findByIdForUser(id, userId);
      if (!existing) return undefined;

      const todo = todoDB.updateForUser(id, userId, input);
      if (!todo) return undefined;

      if (
        existing.completed ||
        input.completed !== true ||
        !todo.is_recurring ||
        !todo.recurrence_pattern ||
        !todo.due_date
      ) {
        return { todo };
      }

      const nextInstance = todoDB.create(userId, {
        title: todo.title,
        due_date: calculateNextDueDate(todo.due_date, todo.recurrence_pattern),
        priority: todo.priority,
        is_recurring: true,
        recurrence_pattern: todo.recurrence_pattern,
        reminder_minutes: todo.reminder_minutes ?? null,
      });
      todoDB.copyTagsForTodo(todo.id, nextInstance.id, userId);
      return { todo, nextInstance };
    });
    return update.immediate();
  },
  copyTagsForTodo(sourceTodoId: number, targetTodoId: number, userId: number): void {
    const relationTableExists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'todo_tags'")
      .get();
    if (!relationTableExists) return;

    db.prepare(`
      INSERT OR IGNORE INTO todo_tags (todo_id, tag_id)
      SELECT ?, todo_tags.tag_id
      FROM todo_tags
      JOIN tags ON tags.id = todo_tags.tag_id AND tags.user_id = ?
      WHERE todo_tags.todo_id = ?
    `).run(targetTodoId, userId, sourceTodoId);
  },
  deleteForUser(id: number, userId: number): boolean {
    return (
      db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId)
        .changes > 0
    );
  },
};

export const authenticatorDB = {
  findByCredentialId(credentialId: string): Authenticator | undefined {
    return authenticatorByCredential.get(credentialId) as Authenticator | undefined;
  },
  findByUserId(userId: number): Authenticator[] {
    return authenticatorsByUser.all(userId) as Authenticator[];
  },
  create(
    userId: number,
    credentialId: string,
    publicKey: Uint8Array,
    counter: number,
  ): void {
    db.prepare(
      'INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter) VALUES (?, ?, ?, ?)',
    ).run(userId, credentialId, Buffer.from(publicKey), counter ?? 0);
  },
  updateCounter(id: number, counter: number): void {
    db.prepare('UPDATE authenticators SET counter = ? WHERE id = ?').run(counter ?? 0, id);
  },
};

export const challengeDB = {
  save(
    challenge: Omit<Challenge, 'expires_at'>,
    ttlMs = 5 * 60 * 1000,
  ): void {
    db.prepare(`
      INSERT INTO auth_challenges (username, purpose, challenge, user_id, user_handle, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(username, purpose) DO UPDATE SET
        challenge = excluded.challenge,
        user_id = excluded.user_id,
        user_handle = excluded.user_handle,
        expires_at = excluded.expires_at
    `).run(
      challenge.username,
      challenge.purpose,
      challenge.challenge,
      challenge.user_id,
      challenge.user_handle,
      Date.now() + ttlMs,
    );
  },
  consume(username: string, purpose: Challenge['purpose']): Challenge | undefined {
    return db.transaction(() => {
      const row = db
        .prepare(
          'SELECT username, purpose, challenge, user_id, user_handle, expires_at FROM auth_challenges WHERE username = ? AND purpose = ?',
        )
        .get(username, purpose) as Challenge | undefined;
      db.prepare('DELETE FROM auth_challenges WHERE username = ? AND purpose = ?').run(
        username,
        purpose,
      );
      if (!row || row.expires_at <= Date.now()) return undefined;
      return row;
    })();
  },
};

export const registrationDB = {
  createUserAndAuthenticator(
    username: string,
    userHandle: Buffer,
    credentialId: string,
    publicKey: Uint8Array,
    counter: number,
  ): AuthUser {
    return db.transaction(() => {
      const user = userDB.create(username, userHandle);
      authenticatorDB.create(user.id, credentialId, publicKey, counter ?? 0);
      return user;
    })();
  },
  addAuthenticator(
    userId: number,
    credentialId: string,
    publicKey: Uint8Array,
    counter: number,
  ): AuthUser {
    return db.transaction(() => {
      authenticatorDB.create(userId, credentialId, publicKey, counter ?? 0);
      const user = userDB.findById(userId);
      if (!user) throw new Error('User not found while registering authenticator');
      return user;
    })();
  },
};
