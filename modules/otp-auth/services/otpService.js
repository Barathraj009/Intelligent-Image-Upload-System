const config = require('../config/env');
const store = require('./otpStore');
const { generateOtp, hashOtp, verifyOtpHash, maskEmail } = require('../utils/otpGenerator');
// Referenced through the module object (not destructured) so tests can
// swap in a stubbed deliverer; the controller path itself is unchanged.
const emailService = require('./emailService');
const logger = require('../utils/logger');

// Distinct error codes so the controller can map each to a friendly,
// non-technical message without string-matching on prose.
const OtpError = {
  COOLDOWN: 'COOLDOWN_ACTIVE',
  RATE_LIMITED: 'TOO_MANY_REQUESTS',
  EMAIL_FAILED: 'EMAIL_DELIVERY_FAILED',
  NOT_FOUND: 'OTP_NOT_FOUND',
  EXPIRED: 'OTP_EXPIRED',
  LOCKED: 'TOO_MANY_ATTEMPTS',
  INVALID: 'INVALID_OTP',
};

class OtpServiceError extends Error {
  constructor(code, meta = {}) {
    super(code);
    this.code = code;
    this.meta = meta;
  }
}

function windowMs() {
  return config.otp.requestWindowMinutes * 60 * 1000;
}

/**
 * Generates, stores, and emails a new OTP for the given email.
 * Enforces: resend cooldown + rolling-window request cap.
 */
async function requestOtp(email) {
  const existing = store.getRaw(email);
  const now = Date.now();

  if (existing) {
    const secondsSinceLast = (now - existing.lastSentAt) / 1000;
    if (secondsSinceLast < config.otp.resendCooldownSeconds) {
      throw new OtpServiceError(OtpError.COOLDOWN, {
        retryAfterSeconds: Math.ceil(config.otp.resendCooldownSeconds - secondsSinceLast),
      });
    }

    const recentRequests = (existing.requestTimestamps || []).filter(
      (t) => now - t < windowMs()
    );
    if (recentRequests.length >= config.otp.maxRequestsPerWindow) {
      throw new OtpServiceError(OtpError.RATE_LIMITED, {
        retryAfterSeconds: Math.ceil(
          (recentRequests[0] + windowMs() - now) / 1000
        ),
      });
    }
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp, email);
  const requestTimestamps = [
    ...((existing && existing.requestTimestamps) || []).filter((t) => now - t < windowMs()),
    now,
  ];

  // Send the email BEFORE committing the new record, so a delivery
  // failure doesn't lock the user out of a still-valid previous code.
  try {
    await emailService.sendOtpEmail(email, otp);
  } catch (err) {
    throw new OtpServiceError(OtpError.EMAIL_FAILED);
  }

  store.set(email, {
    otpHash,
    expiresAt: now + config.otp.expiryMinutes * 60 * 1000,
    attempts: 0,
    maxAttempts: config.otp.maxAttempts,
    lastSentAt: now,
    requestTimestamps,
    locked: false,
  });

  logger.info('OTP requested', { email: maskEmail(email) });

  return {
    maskedEmail: maskEmail(email),
    expiresInSeconds: config.otp.expiryMinutes * 60,
    resendCooldownSeconds: config.otp.resendCooldownSeconds,
  };
}

/**
 * Verifies a submitted OTP. On success, deletes the stored record so the
 * same code can never be replayed. On failure, increments the attempt
 * counter and locks the record once the max is reached.
 */
function verifyOtp(email, submittedOtp) {
  const record = store.get(email);

  if (!record) {
    // Could be "never requested" or "expired" — treat both as the
    // user-facing "expired" case; we don't reveal which for privacy.
    throw new OtpServiceError(OtpError.EXPIRED);
  }

  if (record.locked) {
    throw new OtpServiceError(OtpError.LOCKED);
  }

  const isValid = verifyOtpHash(submittedOtp, email, record.otpHash);

  if (!isValid) {
    const updated = store.incrementAttempts(email);
    if (updated && updated.locked) {
      throw new OtpServiceError(OtpError.LOCKED);
    }
    throw new OtpServiceError(OtpError.INVALID, {
      attemptsRemaining: config.otp.maxAttempts - (updated ? updated.attempts : 1),
    });
  }

  // Success: delete immediately so this OTP cannot be reused/replayed.
  store.delete(email);
  logger.info('OTP verified successfully', { email: maskEmail(email) });

  return true;
}

module.exports = { requestOtp, verifyOtp, OtpError, OtpServiceError };
