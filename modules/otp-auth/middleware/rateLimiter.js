const rateLimit = require('express-rate-limit');

// These are IP-based safety nets on top of the per-email logic in
// otpService.js (cooldown + rolling window). Two layers protect against:
//  - a single attacker hammering many different emails from one IP
//  - a single email being hammered (handled per-email in otpService)
const friendlyHandler = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    error: 'RATE_LIMITED',
    message,
  });
};

const sendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: friendlyHandler(
    "We're seeing a lot of requests from your network. Please try again in a few minutes."
  ),
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: friendlyHandler(
    'Too many verification attempts from your network. Please try again shortly.'
  ),
});

module.exports = { sendOtpLimiter, verifyOtpLimiter };
