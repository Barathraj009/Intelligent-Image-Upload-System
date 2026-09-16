const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;

// Captures the last "sent" message when using the json transport. Test
// fixtures read the OTP out of this — real SMTP mode never stores email
// contents in memory.
let lastTestMessage = null;

function getTransporter() {
  if (transporter) return transporter;

  if (config.email.transport === 'json') {
    // Offline transport for tests / demo without Gmail credentials.
    // Nodemailer writes the rendered message into `info.message` on send.
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmail.user,
      pass: config.gmail.appPassword,
    },
    // Fail fast rather than hanging a request indefinitely if Gmail's
    // SMTP servers are unreachable (e.g. network/firewall issues).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return transporter;
}

/**
 * Test-only hook: returns the most recent JSON-transport message, or null
 * when no message has been sent / real SMTP is in use. The raw OTP is
 * only ever available here (inside the message body), never logged by the
 * application itself.
 */
function getLastTestMessage() {
  return lastTestMessage;
}

function otpEmailHtml({ otp, appName, expiryMinutes }) {
  return `
  <div style="background:#f4f4f5;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e0;">
      <div style="background:#14162B;padding:24px 32px;">
        <span style="color:#F5F4EF;font-size:18px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(
          appName
        )}</span>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#14162B;">Your verification code</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b4b52;">
          Use the code below to finish signing in. This code is valid for
          <strong>${expiryMinutes} minutes</strong>.
        </p>
        <div style="background:#f7f7f5;border:1px solid #e5e5e0;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px;">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#14162B;font-family:'Courier New',monospace;">${escapeHtml(
            otp
          )}</span>
        </div>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b6b72;">
          For your security, do not share this code with anyone — including
          anyone claiming to be from ${escapeHtml(appName)}.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6b72;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
      <div style="padding:16px 32px;background:#fafaf8;border-top:1px solid #e5e5e0;">
        <p style="margin:0;font-size:12px;color:#9a9aa0;">Sent by ${escapeHtml(appName)} — automated message, please don't reply.</p>
      </div>
    </div>
  </div>`;
}

function otpEmailText({ otp, appName, expiryMinutes }) {
  return [
    `${appName} — Your Verification Code`,
    '',
    `Your verification code is: ${otp}`,
    '',
    `This code expires in ${expiryMinutes} minutes.`,
    "Do not share this code with anyone.",
    '',
    `If you didn't request this, you can ignore this email.`,
  ].join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sends the OTP email. Throws on failure — callers must catch this and
 * translate it into a user-friendly API error (see authController).
 */
async function sendOtpEmail(toEmail, otp) {
  const mailOptions = {
    from: `"${config.appName}" <${config.gmail.user}>`,
    to: toEmail,
    subject: `Your ${config.appName} verification code`,
    text: otpEmailText({ otp, appName: config.appName, expiryMinutes: config.otp.expiryMinutes }),
    html: otpEmailHtml({ otp, appName: config.appName, expiryMinutes: config.otp.expiryMinutes }),
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    if (config.email.transport === 'json') lastTestMessage = info.message;
    logger.info('OTP email sent', { to: toEmail });
  } catch (err) {
    logger.error('Failed to send OTP email', { to: toEmail, error: err.message });
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}

module.exports = { sendOtpEmail, getLastTestMessage };
