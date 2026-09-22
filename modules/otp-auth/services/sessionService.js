const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

/**
 * Denylist of revoked token ids (jti). Stored in memory: sufficient for a
 * single-instance deployment and short-lived tokens (PENDING_WORK.md notes
 * Redis/DB for multi-instance). Using `jti` allows revocation of one issued
 * token without touching others.
 */
const revokedJtis = new Map(); // jti -> exp (epoch ms)

const REVOKE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Periodic cleanup so the Map doesn't grow with already-expired entries.
const revokeSweeper = setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of revokedJtis.entries()) {
    if (exp <= now) revokedJtis.delete(jti);
  }
}, REVOKE_SWEEP_INTERVAL_MS);
revokeSweeper.unref?.();

/**
 * Issues a short-lived session token proving the holder completed OTP
 * verification for this email. This is the hand-off artifact a host
 * application uses to know "this user is authenticated" — see
 * INTEGRATION.md for how to consume it.
 */
function issueSessionToken(email) {
  const now = Math.floor(Date.now() / 1000);
  const decoded = jwt.sign(
    { email: email.toLowerCase(), authMethod: 'gmail-otp', iat: now, jti: crypto.randomUUID() },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  // jwt.sign(config) returns a string, but we want the payload metadata
  // (exp) for later use. Re-decode to read the exp timestamp.
  return {
    token: decoded,
    expiresAt: jwt.decode(decoded).exp * 1000,
    issuedAt: now * 1000,
  };
}

function verifySessionToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    return revokedJtis.has(decoded.jti) ? null : decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Revoke a token that is still within its lifetime (used on logout), so a
 * credential that outlived cookie clearing can no longer authorize.
 */
function revokeSessionToken(token) {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.jti || typeof decoded.exp !== 'number') return false;
  revokedJtis.set(decoded.jti, decoded.exp * 1000);
  return true;
}

/**
 * Decodes a token WITHOUT verifying its signature. Only safe to trust
 * payload fields (like `exp` for cookie lifetime math) — never use this
 * to authorize anything.
 */
function decodeSessionToken(token) {
  try {
    return jwt.decode(token);
  } catch (err) {
    return null;
  }
}

module.exports = {
  issueSessionToken,
  verifySessionToken,
  decodeSessionToken,
  revokeSessionToken,
};
