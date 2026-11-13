import 'server-only';

import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { User } from './session-token';

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
