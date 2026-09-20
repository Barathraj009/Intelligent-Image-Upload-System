"use strict";

/**
 * Host-side user store for the OTP auth module.
 *
 * The reusable auth module proves identity (Gmail + OTP) but never owns
 * the application's user accounts. After a successful verification it
 * calls the adapter below — this file — which persists users in SQLite.
 *
 * Schema: a single `users` table keyed by normalized (lowercased) email.
 * `findOrCreateUser` is the ONLY piece of the auth flow that depends on
 * this project's storage choice.
 */

const path = require("path");
const Database = require("better-sqlite3");

// DATA_DIR is overridable so deployments can point SQLite at a persistent
// volume (e.g. Render disk mounted at /data) and so tests can isolate the
// database in a temp directory. Defaults to <repo>/data for local runs.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

// Ensure the data directory exists before opening the database file.
const fs = require("fs");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema: email is the natural key. UNIQUE at the DB level makes
// duplicates impossible even under concurrent logins.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT NOT NULL UNIQUE,
    createdAt    TEXT NOT NULL,
    lastLoginAt  TEXT NOT NULL
  );
`);

const insertUser = db.prepare(
  "INSERT INTO users (email, createdAt, lastLoginAt) VALUES (@email, @createdAt, @lastLoginAt)"
);
const findUser = db.prepare("SELECT * FROM users WHERE email = ?");
const touchLogin = db.prepare("UPDATE users SET lastLoginAt = ? WHERE email = ?");

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/**
 * Module callback: find-or-create the user record for a verified email.
 * Returns { user, isNewUser } — the shape the OTP module relays back in
 * the /verify-otp response body.
 */
async function findOrCreateUser(email) {
  const normalized = normalizeEmail(email);
  const now = new Date().toISOString();

  let user = findUser.get(normalized);

  if (user) {
    touchLogin.run(now, normalized);
    user = findUser.get(normalized);
    return { user, isNewUser: false };
  }

  insertUser.run({ email: normalized, createdAt: now, lastLoginAt: now });
  user = findUser.get(normalized);
  return { user, isNewUser: true };
}

module.exports = { findOrCreateUser, db, DB_PATH };