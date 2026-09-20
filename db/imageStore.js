"use strict";

/**
 * Host-side image metadata store.
 *
 * Solves the "no central gallery" gap: every successful upload is recorded
 * in SQLite so the portal can list *all* images a user has collected, not
 * just the ones uploaded during the current browser session.
 */

const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

// Guarantee the `users` table exists BEFORE this module creates the `images`
// table that references it. userStore.js keeps its own connection to the same
// WAL database, which is supported by SQLite.
require("./userStore");

// Reuse the same database file as the user store so there is a single
// `data/app.db` (WAL mode already enabled by userStore.js).
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
// Foreign-key enforcement is per-connection; this module's connection must
// enable it explicitly so ON DELETE CASCADE / parent-existence checks apply
// to images writes made through this store.
db.pragma("foreign_keys = ON");

// Images are owned by the email that uploaded them (the same identity the
// auth module hands off). public_id is unique per Cloudinary asset.
db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL,
    public_id     TEXT NOT NULL UNIQUE,
    url           TEXT NOT NULL,
    original_name TEXT NOT NULL,
    format        TEXT,
    width         INTEGER,
    height        INTEGER,
    bytes         INTEGER,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_images_email ON images(email);
  CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
`);

const insertImage = db.prepare(
  `INSERT INTO images
     (email, public_id, url, original_name, format, width, height, bytes, created_at)
   VALUES
     (@email, @publicId, @url, @originalName, @format, @width, @height, @bytes, @createdAt)`
);

const listImagesByEmail = db.prepare(
  "SELECT * FROM images WHERE email = ? ORDER BY created_at DESC, id DESC"
);

const findImageById = db.prepare("SELECT * FROM images WHERE id = ? AND email = ?");

const deleteImageById = db.prepare("DELETE FROM images WHERE id = ? AND email = ?");

/**
 * Record a successful upload.
 * @param {string} email - Authenticated owner (lowercased).
 * @param {object} meta  - buildImageMeta() output.
 */
function createImageRecord(email, meta) {
  const info = insertImage.run({
    email,
    publicId: meta.publicId,
    url: meta.url,
    originalName: meta.originalName,
    format: meta.format || null,
    width: meta.width || null,
    height: meta.height || null,
    bytes: meta.bytes || null,
    createdAt: new Date().toISOString(),
  });

  return {
    id: Number(info.lastInsertRowid),
    email,
    publicId: meta.publicId,
    url: meta.url,
    originalName: meta.originalName,
    format: meta.format || null,
    width: meta.width || null,
    height: meta.height || null,
    bytes: meta.bytes || null,
    createdAt: new Date().toISOString(),
  };
}

/** List all images owned by `email`, newest first. */
function listImages(email) {
  return listImagesByEmail.all(email.toLowerCase().trim());
}

/**
 * Find one image owned by `email` (or null). Used by the delete endpoint so
 * ownership is verified before the Cloudinary asset is removed.
 */
function findImage(id, email) {
  return findImageById.get(id, email.toLowerCase().trim()) || null;
}

/**
 * Delete the image row owned by `email` with the given id.
 * @returns {{ deleted: boolean, publicId: string|null }}
 */
function deleteImageRecord(id, email) {
  const row = findImageById.get(id, email.toLowerCase().trim());
  if (!row) return { deleted: false, publicId: null };
  deleteImageById.run(id, email.toLowerCase().trim());
  return { deleted: true, publicId: row.public_id };
}

module.exports = {
  createImageRecord,
  listImages,
  findImage,
  deleteImageRecord,
  DB_PATH,
};