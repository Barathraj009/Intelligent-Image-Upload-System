const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Issues a short-lived session token proving the holder completed OTP
 * verification for this email. This is the hand-off artifact a host
 * application uses to know "this user is authenticated" — see
 * INTEGRATION.md for how to consume it.
 */
function issueSessionToken(email) {
  const now = Math.floor(Date.now() / 1000);
  const decoded = jwt.sign(
    { email: email.toLowerCase(), authMethod: 'gmail-otp', iat: now },
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
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
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

module.exports = { issueSessionToken, verifySessionToken, decodeSessionToken };
