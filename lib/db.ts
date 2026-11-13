import 'server-only';

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { PRIORITY_ORDER, PRIORITY_VALUES } from './priority';
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

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export class TagNotFoundError extends Error {
  constructor() {
    super('Todo or tag not found');
  }
}

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
  tags?: Tag[];
}

export interface CreateTodoInput {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  tag_ids?: number[];
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {
  completed?: boolean;
}

interface TodoRow extends Omit<Todo, 'completed' | 'is_recurring'> {
  completed: number;
  is_recurring: number;
}

const databasePath = process.env.TODO_DATABASE_PATH ?? join(process.cwd(), 'todos.db');

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

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  );
  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );
  CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
  CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);
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
    tags: tagDB.findByTodoId(row.id, row.user_id),
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
    return db.transaction(() => {
      assertOwnedTags(input.tag_ids ?? [], userId);
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
      const id = Number(result.lastInsertRowid);
      replaceTodoTags(id, userId, input.tag_ids ?? []);
      const todo = this.findByIdForUser(id, userId);
      if (!todo) throw new Error('Todo creation did not return a todo');
      return todo;
    })();
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
    return db.transaction(() => {
      if (!this.findByIdForUser(id, userId)) return undefined;
      if (input.tag_ids !== undefined) replaceTodoTags(id, userId, input.tag_ids);
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
    })();
  },
  deleteForUser(id: number, userId: number): boolean {
    return (
      db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId)
        .changes > 0
    );
  },
};

function assertOwnedTags(ids: number[], userId: number): void {
  for (const id of ids) {
    if (!tagDB.findById(id, userId)) throw new TagNotFoundError();
  }
}

function replaceTodoTags(todoId: number, userId: number, ids: number[]): void {
  assertOwnedTags(ids, userId);
  db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId);
  const insert = db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
  for (const id of ids) insert.run(todoId, id);
}

export const tagDB = {
  findAllByUser(userId: number): Tag[] {
    return db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name, id').all(userId) as Tag[];
  },
  findById(id: number, userId: number): Tag | undefined {
    return db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, userId) as Tag | undefined;
  },
  create(userId: number, input: CreateTagInput): Tag {
    const result = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)')
      .run(userId, input.name, input.color ?? '#3B82F6');
    const tag = this.findById(Number(result.lastInsertRowid), userId);
    if (!tag) throw new Error('Tag creation did not return a tag');
    return tag;
  },
  update(id: number, userId: number, input: UpdateTagInput): Tag | undefined {
    const tag = this.findById(id, userId);
    if (!tag) return undefined;
    db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ? AND user_id = ?')
      .run(input.name ?? tag.name, input.color ?? tag.color, id, userId);
    return this.findById(id, userId);
  },
  delete(id: number, userId: number): boolean {
    return db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  },
  findByTodoId(todoId: number, userId: number): Tag[] {
    return db.prepare(`
      SELECT tags.* FROM tags
      JOIN todo_tags ON todo_tags.tag_id = tags.id
      JOIN todos ON todos.id = todo_tags.todo_id
      WHERE todos.id = ? AND todos.user_id = ? AND tags.user_id = ?
      ORDER BY tags.name, tags.id
    `).all(todoId, userId, userId) as Tag[];
  },
  attachToTodo(todoId: number, tagId: number, userId: number): void {
    db.transaction(() => {
      if (!todoDB.findByIdForUser(todoId, userId) || !this.findById(tagId, userId)) {
        throw new TagNotFoundError();
      }
      db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todoId, tagId);
    })();
  },
  detachFromTodo(todoId: number, tagId: number, userId: number): void {
    db.transaction(() => {
      if (!todoDB.findByIdForUser(todoId, userId) || !this.findById(tagId, userId)) {
        throw new TagNotFoundError();
      }
      db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?').run(todoId, tagId);
    })();
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
