const config = require('../config/env');
const otpService = require('../services/otpService');
const { issueSessionToken, decodeSessionToken } = require('../services/sessionService');
const { getUserStore } = require('../services/userStore');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// Maps internal OTP error codes to friendly, user-facing responses.
// Keeping this table here (not in otpService) keeps the service layer
// transport-agnostic — it doesn't know about HTTP status codes.
const ERROR_RESPONSES = {
  COOLDOWN_ACTIVE: (meta) => ({
    status: 429,
    error: 'COOLDOWN_ACTIVE',
    message: `Please wait ${meta.retryAfterSeconds}s before requesting another code.`,
  }),
  TOO_MANY_REQUESTS: (meta) => ({
    status: 429,
    error: 'TOO_MANY_REQUESTS',
    message: "You've requested too many codes. Please try again later.",
  }),
  EMAIL_DELIVERY_FAILED: () => ({
    status: 502,
    error: 'EMAIL_DELIVERY_FAILED',
    message: "We couldn't send the verification code right now. Please try again.",
  }),
  OTP_EXPIRED: () => ({
    status: 400,
    error: 'OTP_EXPIRED',
    message: 'That code has expired. Please request a new one.',
  }),
  TOO_MANY_ATTEMPTS: () => ({
    status: 429,
    error: 'TOO_MANY_ATTEMPTS',
    message: 'Too many incorrect attempts. Please request a new code.',
  }),
  INVALID_OTP: (meta) => ({
    status: 400,
    error: 'INVALID_OTP',
    message:
      meta.attemptsRemaining > 0
        ? `That code isn't right. ${meta.attemptsRemaining} attempt(s) remaining.`
        : "That code isn't right.",
  }),
};

function sendServiceError(res, err) {
  const builder = ERROR_RESPONSES[err.code];
  if (!builder) {
    logger.error('Unmapped OTP service error', { code: err.code });
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
  const { status, error, message } = builder(err.meta || {});
  return res.status(status).json({ success: false, error, message, ...err.meta });
}

// The only legit state where delivery can fail without anything being wrong
// with the request itself is the operator forgetting to configure real Gmail
// credentials. Surface that loudly (instead of a generic 502) so the demo
// user knows exactly what to do to get real codes flowing.
function emailNotConfigured() {
  return config.email.transport !== 'json' && !(config.gmail.user && config.gmail.appPassword);
}

function handleDeliveryFailure(res, err) {
  if (err.code === 'EMAIL_DELIVERY_FAILED' && emailNotConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'EMAIL_NOT_CONFIGURED',
      message:
        'Email sending is not configured yet. Add your real Gmail address and an App Password ' +
        'to backend/.env, then restart the server. (Create an App Password at ' +
        'https://myaccount.google.com/apppasswords — this sends the verification codes.)',
    });
  }
  return sendServiceError(res, err);
}

function setSessionCookie(res, token) {
  if (!config.cookie.useCookie) return;

  // Keep the cookie lifetime aligned with the JWT's own expiry so a
  // cookie doesn't outlive (or out-die) the token it carries.
  const decoded = decodeSessionToken(token);
  const maxAge = decoded && decoded.exp ? decoded.exp * 1000 - Date.now() : null;

  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.cookie.sameSite,
    ...(maxAge && maxAge > 0 ? { maxAge } : {}),
  });
}

const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  try {
    const result = await otpService.requestOtp(email);
    return res.status(200).json({
      success: true,
      message: 'Verification code sent.',
      maskedEmail: result.maskedEmail,
      expiresInSeconds: result.expiresInSeconds,
      resendCooldownSeconds: result.resendCooldownSeconds,
    });
  } catch (err) {
    if (err instanceof otpService.OtpServiceError) return handleDeliveryFailure(res, err);
    throw err;
  }
});

const resendOtp = asyncHandler(async (req, res) => {
  // Resend uses the exact same rules (cooldown + rolling window) as send —
  // exposed as a separate endpoint purely for a clearer client-side intent
  // and analytics, not different server behavior.
  const { email } = req.body;
  try {
    const result = await otpService.requestOtp(email);
    return res.status(200).json({
      success: true,
      message: 'A new verification code has been sent.',
      maskedEmail: result.maskedEmail,
      expiresInSeconds: result.expiresInSeconds,
      resendCooldownSeconds: result.resendCooldownSeconds,
    });
  } catch (err) {
    if (err instanceof otpService.OtpServiceError) return handleDeliveryFailure(res, err);
    throw err;
  }
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!otp || typeof otp !== 'string' || !/^\d{4,8}$/.test(otp.trim())) {
    return res.status(400).json({
      success: false,
      error: 'OTP_FORMAT_INVALID',
      message: `Please enter the ${config.otp.length}-digit code.`,
    });
  }

  try {
    otpService.verifyOtp(email, otp.trim());
  } catch (err) {
    if (err instanceof otpService.OtpServiceError) return sendServiceError(res, err);
    throw err;
  }

  // Success — issue the hand-off session token. This is what a host
  // application checks to know the user is authenticated.
  const session = issueSessionToken(email);
  setSessionCookie(res, session.token);

  // Hand-off to the host application's user database. The module owns
  // identity verification; the host owns the user record. See
  // src/services/userStore.js.
  let userResult = { user: null, isNewUser: false };
  try {
    userResult = await getUserStore().findOrCreateUser(email);
  } catch (err) {
    // Identity verification succeeded even if the host DB is briefly down.
    // Log it, return the valid session anyway, and let the host's own
    // middleware lazily reconcile the account on its next request.
    logger.warn('Host user store failed during post-verify sync', {
      email,
      error: err.message,
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Email verified successfully.',
    email,
    token: session.token, // also returned in-body for clients not using cookies
    expiresAt: session.expiresAt, // epoch ms when this session expires
    verifiedAt: new Date().toISOString(),
    isNewUser: userResult.isNewUser,
    user: userResult.user, // host-shaped user object, or null in demo when DB fails
  });
});

const logout = asyncHandler(async (req, res) => {
  if (config.cookie.useCookie) {
    res.clearCookie(config.cookie.name, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: config.cookie.sameSite,
    });
  }
  // Note: JWTs are stateless, so this clears the client-held credential
  // but does not revoke a Bearer token a caller stored elsewhere. See
  // PENDING_WORK.md → "Session revocation" for a production-grade approach
  // (server-side denylist / short-lived refresh tokens).
  return res.status(200).json({ success: true, message: 'Logged out.' });
});

const session = asyncHandler(async (req, res) => {
  // Protected by middleware/auth.js#requireSession. req.auth is the
  // verified JWT payload, which includes iat (issued-at) and exp (expiry)
  // in Unix seconds.
  const iatMs = req.auth.iat ? req.auth.iat * 1000 : null;
  const expMs = req.auth.exp ? req.auth.exp * 1000 : null;
  return res.status(200).json({
    success: true,
    email: req.auth.email,
    authMethod: req.auth.authMethod,
    verifiedAt: iatMs ? new Date(iatMs).toISOString() : null,
    expiresAt: expMs ? new Date(expMs).toISOString() : null,
  });
});

module.exports = { sendOtp, resendOtp, verifyOtp, logout, session };