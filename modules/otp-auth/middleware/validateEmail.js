const config = require('../config/env');

// Reasonably strict, dependency-free email format check.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const GMAIL_DOMAIN_REGEX = /@(gmail\.com|googlemail\.com)$/i;

function validateEmail(req, res, next) {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      success: false,
      error: 'EMAIL_REQUIRED',
      message: 'Please enter your email address.',
    });
  }

  const trimmed = email.trim();

  if (!EMAIL_REGEX.test(trimmed)) {
    return res.status(400).json({
      success: false,
      error: 'EMAIL_INVALID',
      message: 'Please enter a valid email address.',
    });
  }

  if (config.gmail.onlyGmail && !GMAIL_DOMAIN_REGEX.test(trimmed)) {
    return res.status(400).json({
      success: false,
      error: 'EMAIL_NOT_GMAIL',
      message: 'Please use a Gmail address (e.g. name@gmail.com).',
    });
  }

  req.body.email = trimmed.toLowerCase();
  next();
}

module.exports = validateEmail;
