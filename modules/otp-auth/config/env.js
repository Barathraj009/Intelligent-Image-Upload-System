/**
 * Centralized environment configuration.
 * Loads and validates process.env once; everything else in the app
 * should import `config` from here instead of touching process.env directly.
 */
require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // Fail loudly at boot rather than silently misbehaving at request time.
    // eslint-disable-next-line no-console
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, fallback, min, max) {
  return Math.min(max, Math.max(min, int(value, fallback)));
}

// Accepts: unset -> false, "true"/"false", a number ("1"), or a trust-proxy
// value express understands ("loopback", "10.0.0.1", ...).
function parseTrustProxy(value) {
  if (value === undefined || value === '') return false;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
}

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  isTest,
  port: int(process.env.PORT, 4000),

  // Must be set when this module runs behind a reverse proxy / load
  // balancer, otherwise per-IP rate limiting keys off the proxy's IP.
  // See https://expressjs.com/en/guide/behind-proxies.html
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:4000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  appName: process.env.APP_NAME || 'AirIndex India',

  gmail: {
    user: process.env.GMAIL_USER || '',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
    onlyGmail: bool(process.env.GMAIL_ONLY, true),
  },

  email: {
    // "gmail" = real delivery via Gmail SMTP (App Password).
    // "json" = offline/test transport (writes the message to memory; also
    //          forced automatically when NODE_ENV=test). Never for prod.
    transport:
      isTest || process.env.EMAIL_TRANSPORT === 'json'
        ? 'json'
        : process.env.EMAIL_TRANSPORT || 'gmail',
  },

  otp: {
    // Clamped to [4,8]; the verify endpoint accepts the same range.
    length: clampInt(process.env.OTP_LENGTH, 6, 4, 8),
    expiryMinutes: int(process.env.OTP_EXPIRY_MINUTES, 5),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: int(process.env.OTP_RESEND_COOLDOWN_SECONDS, 45),
    maxRequestsPerWindow: int(process.env.OTP_MAX_REQUESTS_PER_WINDOW, 5),
    requestWindowMinutes: int(process.env.OTP_REQUEST_WINDOW_MINUTES, 15),
    hashSecret: required('OTP_HASH_SECRET', isProd ? undefined : 'dev-only-otp-secret-change-me'),
  },

  jwt: {
    secret: required('JWT_SECRET', isProd ? undefined : 'dev-only-jwt-secret-change-me'),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  },

  cookie: {
    useCookie: bool(process.env.USE_COOKIE_SESSION, true),
    name: process.env.COOKIE_NAME || 'otp_auth_session',
    // "lax" (same-origin friendly), "strict", or "none" (cross-origin API;
    // requires HTTPS/secure cookies). Host app decides based on its own
    // first-party / third-party cookie needs.
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
  },
};

// Warn (but don't crash local dev, and never in test/json mode) if email
// credentials are missing — send-otp requests will fail clearly at request
// time instead.
if (config.email.transport !== 'json' && (!config.gmail.user || !config.gmail.appPassword)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] GMAIL_USER / GMAIL_APP_PASSWORD are not set. ' +
      'Email sending will fail until these are configured in .env'
  );
}

if (config.cookie.sameSite === 'none' && !config.isProd) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] COOKIE_SAMESITE=none requires HTTPS so the cookie can be marked Secure.'
  );
}

module.exports = config;