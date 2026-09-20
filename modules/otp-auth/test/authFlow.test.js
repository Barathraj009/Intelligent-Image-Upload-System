process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, post } = require('../testlib/helpers');
const { getLastTestMessage } = require('../services/emailService');

let base;
let otpFor;

function lastOtp() {
  const message = getLastTestMessage();
  assert.ok(message, 'expected an email to have been sent');
  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  const match = raw.match(/verification code is: (\d{4,8})/i);
  assert.ok(match, `could not find OTP in test message: ${raw.slice(0, 300)}`);
  return match[1];
}

before(async () => {
  base = await startServer();
});
after(async () => {
  await stopServer();
});

test('rejects missing / malformed / non-Gmail emails', async () => {
  const missing = await post(base, '/api/auth/send-otp', {});
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'EMAIL_REQUIRED');

  const malformed = await post(base, '/api/auth/send-otp', { email: 'not-an-email' });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, 'EMAIL_INVALID');

  const nonGmail = await post(base, '/api/auth/send-otp', { email: 'user@yahoo.com' });
  assert.equal(nonGmail.status, 400);
  assert.equal(nonGmail.body.error, 'EMAIL_NOT_GMAIL');
});

test('send-otp returns masked email, expiry metadata, and never the code', async () => {
  const res = await post(base, '/api/auth/send-otp', { email: 'valid@gmail.com' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.maskedEmail, 'v****@gmail.com');
  assert.equal(res.body.expiresInSeconds, 300);
  assert.ok(res.body.resendCooldownSeconds >= 0);
  assert.equal('otp' in res.body, false);
  assert.equal('code' in res.body, false);
  otpFor = lastOtp();
});

test('verify-otp succeeds with the emailed code and returns a session token', async () => {
  const res = await post(base, '/api/auth/verify-otp', {
    email: 'valid@gmail.com',
    otp: otpFor,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.email, 'valid@gmail.com');
  assert.ok(res.body.token, 'expected a session token');
  assert.ok(res.body.verifiedAt);
  assert.equal(res.body.isNewUser, true);
  assert.ok(res.body.user && res.body.user.id, 'expected a user object from the store');
});

test('an OTP cannot be replayed after successful verification', async () => {
  const res = await post(base, '/api/auth/verify-otp', { email: 'valid@gmail.com', otp: otpFor });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'OTP_EXPIRED');
});

test('verify-otp rejects wrong codes with remaining attempts', async () => {
  const sent = await post(base, '/api/auth/send-otp', { email: 'wrong@gmail.com' });
  assert.equal(sent.status, 200);

  const res = await post(base, '/api/auth/verify-otp', { email: 'wrong@gmail.com', otp: '000000' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'INVALID_OTP');
  assert.ok(res.body.attemptsRemaining > 0);
});

test('verify-otp rejects malformed codes before hitting the service', async () => {
  const res = await post(base, '/api/auth/verify-otp', { email: 'valid@gmail.com', otp: 'abc123' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'OTP_FORMAT_INVALID');
});