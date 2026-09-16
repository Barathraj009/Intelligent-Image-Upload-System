const { verifySessionToken } = require('../services/sessionService');
const config = require('../config/env');

/**
 * Extracts the session token from either the httpOnly cookie (default)
 * or an Authorization: Bearer header (for SPA/mobile clients that manage
 * their own token storage), and attaches the decoded session to req.auth.
 *
 * This is the piece a host application relies on to protect its own
 * routes once the OTP module has authenticated a user — see
 * INTEGRATION.md.
 */
function requireSession(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  } else if (config.cookie.useCookie && req.cookies) {
    token = req.cookies[config.cookie.name];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'NOT_AUTHENTICATED',
      message: 'Please verify your email to continue.',
    });
  }

  const decoded = verifySessionToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'SESSION_EXPIRED',
      message: 'Your session has expired. Please sign in again.',
    });
  }

  req.auth = decoded;
  next();
}

module.exports = { requireSession };
