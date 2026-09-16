/**
 * OTP Storage Layer
 * ------------------------------------------------------------------
 * This is an IN-MEMORY reference implementation, suitable for local
 * development, demos, and single-instance deployments.
 *
 * It is intentionally isolated behind this module's function exports
 * (get/set/delete/etc.) so it can be swapped for a real store — Redis,
 * Postgres, DynamoDB, etc. — without touching any calling code. See
 * PENDING_WORK.md → "Storage layer" for what a production swap needs.
 *
 * Record shape kept per (lowercased) email:
 * {
 *   otpHash: string,          // HMAC hash of the OTP, never the raw code
 *   expiresAt: number,        // epoch ms
 *   attempts: number,         // failed verification attempts so far
 *   maxAttempts: number,
 *   lastSentAt: number,       // epoch ms of most recent send
 *   requestTimestamps: number[], // epoch ms of sends within the rate window
 *   locked: boolean,          // true once max attempts exceeded
 * }
 */
const store = new Map();

function key(email) {
  return email.trim().toLowerCase();
}

function set(email, record) {
  store.set(key(email), record);
}

function get(email) {
  const record = store.get(key(email));
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    store.delete(key(email));
    return null;
  }
  return record;
}

// Like get(), but does not evict expired-but-still-rate-limit-relevant data.
// Used for rate limiting decisions where we need lastSentAt / requestTimestamps
// even after the OTP itself has expired.
function getRaw(email) {
  return store.get(key(email)) || null;
}

function deleteRecord(email) {
  store.delete(key(email));
}

function incrementAttempts(email) {
  const record = store.get(key(email));
  if (!record) return null;
  record.attempts += 1;
  if (record.attempts >= record.maxAttempts) {
    record.locked = true;
  }
  store.set(key(email), record);
  return record;
}

// Periodic sweep so the Map doesn't grow unbounded with expired/abandoned
// entries. Also clears rate-limit windows once they've fully elapsed.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RECORD_AGE_MS = 24 * 60 * 60 * 1000;

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, record] of store.entries()) {
    const age = now - (record.lastSentAt || 0);
    if (age > MAX_RECORD_AGE_MS) {
      store.delete(k);
    }
  }
}, SWEEP_INTERVAL_MS);
sweeper.unref?.();

module.exports = { set, get, getRaw, delete: deleteRecord, incrementAttempts };
