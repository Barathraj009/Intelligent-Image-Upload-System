/**
 * User Storage Adapter
 * ------------------------------------------------------------------
 * The auth module proves identity (OTP verification) but does NOT own the
 * host application's user accounts. After an OTP verifies successfully,
 * the module asks a "user store" to find-or-create the account, then hands
 * control back to the host application. This keeps the host app's own
 * database the single source of truth for its users.
 *
 *   Auth module (this file, swappable)
 *        │  findOrCreateUser(email)
 *        ▼
 *   Host application's users table  <-- the ONLY thing that changes per project
 *
 * The adapter interface is intentionally tiny:
 *
 *   {
 *     findOrCreateUser: async (email) => {
 *       // 1. look the email up in YOUR database (case-normalized, unique column)
 *       // 2. if missing → create the user (first login)
 *       // 3. if present  → update `lastLoginAt` (returning login)
 *       // 4. return { user, isNewUser }
 *     }
 *   }
 *
 * The module never inspects the shape of `user` — it just relays it back
 * in the verify-otp response so the host app can do whatever it needs
 * with its own user object.
 *
 * A host can install its adapter through the module's public API:
 *
 *   const authModule = require('./modules/otp-auth');
 *   authModule.configure({
 *     userStore: {
 *       findOrCreateUser: async (email) => {
 *         const User = require('./models/User');
 *         let user = await User.findByEmail(email);
 *         const isNewUser = !user;
 *         user = user || (await User.create({ email }));
 *         user.lastLoginAt = new Date();
 *         await user.save();
 *         return { user, isNewUser };
 *       },
 *     },
 *   });
 *
 * If no adapter is installed, the built-in reference store below is used.
 * It is an IN-MEMORY Map — fine for the standalone demo, never for
 * real production user data. It exists so the demo can demonstrate the
 * first-login vs returning-login behavior (and duplicate prevention).
 */

// Email normalization shared by the reference store. Real host databases
// should mirror this: store emails lowercased and put a UNIQUE constraint
// on the email column so duplicates are impossible at the DB level too.
function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/**
 * Builds the reference (in-memory) user store. Exported so tests and the
 * demo can construct isolated instances.
 */
function createInMemoryUserStore() {
  // email -> { id, email, createdAt, lastLoginAt }
  const users = new Map();

  async function findOrCreateUser(email) {
    const normalized = normalizeEmail(email);
    const existing = users.get(normalized);

    if (existing) {
      existing.lastLoginAt = new Date().toISOString();
      return { user: { ...existing }, isNewUser: false };
    }

    const user = {
      id: `u_${Math.random().toString(36).slice(2, 10)}`,
      email: normalized,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    users.set(normalized, user);
    return { user: { ...user }, isNewUser: true };
  }

  async function findByEmail(email) {
    const record = users.get(normalizeEmail(email));
    return record ? { ...record } : null;
  }

  return { findOrCreateUser, findByEmail };
}

let activeStore = createInMemoryUserStore();

/**
 * Installs a host-provided user store adapter. Pass `null` to fall back
 * to the built-in reference store.
 */
function setUserStore(adapter) {
  activeStore = adapter && typeof adapter.findOrCreateUser === 'function'
    ? adapter
    : createInMemoryUserStore();
  return activeStore;
}

function getUserStore() {
  return activeStore;
}

module.exports = {
  createInMemoryUserStore,
  setUserStore,
  getUserStore,
  normalizeEmail,
};