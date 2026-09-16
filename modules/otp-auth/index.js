/**
 * Public API of the reusable Gmail OTP auth module.
 *
 * A host application should `require('[path]/src')` (or nest the whole
 * backend/ folder as a module) and use the exports here. This is the only
 * file a host needs to import — it re-exports the app factory, routes,
 * session guard, and the user-store + runtime-config hooks.
 *
 * Example
 * --------
 * const auth = require('./modules/otp-auth');   // <-- this file
 * const app = require('express')();
 * app.use('/api/auth', auth.routes);            // mount the auth API
 * auth.configure({ userStore: myUserDbAdapter }); // plug in YOUR users table
 */
const config = require('./config/env');
const { createApp } = require('./app');
const authRoutes = require('./routes/authRoutes');
const { requireSession } = require('./middleware/auth');
const userStore = require('./services/userStore');

const runtime = {
  // Host application config that can be changed at runtime (e.g. from an
  // environment-specific bootstrap). Static host options like the CORS
  // origin or email provider still come from .env.
  _cfg: {},
};

/**
 * Apply host-provided runtime configuration.
 * Supported keys:
 *   userStore        → { findOrCreateUser, ... } adapter for your users table
 *   postLoginRedirect→ absolute URL the frontend should navigate to after a
 *                      successful verification (used by the demo frontend
 *                      when it has no appName-specific destination).
 */
function configure(overrides = {}) {
  if (overrides.userStore) userStore.setUserStore(overrides.userStore);
  runtime._cfg = { ...runtime._cfg, ...overrides };
  return runtime._cfg;
}

function getConfig() {
  return runtime._cfg;
}

module.exports = {
  config,
  createApp,
  routes: authRoutes,
  requireSession,
  userStore,
  configure,
  getConfig,
};