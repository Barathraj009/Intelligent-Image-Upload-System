const crypto = require('crypto');
const config = require('../config/env');

/**
 * Generates a cryptographically secure numeric OTP of the configured length.
 * Uses crypto.randomInt (CSPRNG), not Math.random().
 */
function generateOtp(length = config.otp.length) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
}

/**
 * OTPs are never stored in plain text. We store an HMAC-SHA256 hash keyed
 * by a server-side secret, so even a database/memory dump doesn't reveal
 * usable codes.
 */
function hashOtp(otp, email) {
  return crypto
    .createHmac('sha256', config.otp.hashSecret)
    .update(`${email.toLowerCase()}:${otp}`)
    .digest('hex');
}

/**
 * Constant-time comparison to avoid timing side-channels when checking
 * a submitted OTP against the stored hash.
 */
function verifyOtpHash(otp, email, storedHash) {
  const candidate = Buffer.from(hashOtp(otp, email));
  const stored = Buffer.from(storedHash);
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

module.exports = { generateOtp, hashOtp, verifyOtpHash, maskEmail };
