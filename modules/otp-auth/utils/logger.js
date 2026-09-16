/**
 * Minimal structured logger.
 * Deliberately has no code path that prints an OTP value — callers must
 * never pass raw OTPs into these functions, even in "debug" mode.
 */
const { isProd } = require('../config/env');

function timestamp() {
  return new Date().toISOString();
}

function info(message, meta = {}) {
  console.log(`[${timestamp()}] INFO  ${message}`, redact(meta));
}

function warn(message, meta = {}) {
  console.warn(`[${timestamp()}] WARN  ${message}`, redact(meta));
}

function error(message, meta = {}) {
  console.error(`[${timestamp()}] ERROR ${message}`, redact(meta));
}

function debug(message, meta = {}) {
  if (isProd) return;
  console.debug(`[${timestamp()}] DEBUG ${message}`, redact(meta));
}

// Strips any field that could plausibly hold an OTP or secret before logging.
function redact(meta) {
  const banned = ['otp', 'code', 'password', 'appPassword', 'token', 'secret'];
  const safe = { ...meta };
  for (const key of Object.keys(safe)) {
    if (banned.some((b) => key.toLowerCase().includes(b))) {
      safe[key] = '[redacted]';
    }
  }
  return safe;
}

module.exports = { info, warn, error, debug };
