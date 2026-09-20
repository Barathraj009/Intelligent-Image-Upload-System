process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '120';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, post } = require('../testlib/helpers');

let base;

before(async () => {
  base = await startServer();
});
after(async () => {
  await stopServer();
});

test('blocks resends during the cooldown window with a retry hint', async () => {
  const email = 'resend@gmail.com';

  const first = await post(base, '/api/auth/send-otp', { email });
  assert.equal(first.status, 200);
  assert.equal(first.body.resendCooldownSeconds, 120);

  const earlyResend = await post(base, '/api/auth/resend-otp', { email });
  assert.equal(earlyResend.status, 429);
  assert.equal(earlyResend.body.error, 'COOLDOWN_ACTIVE');
  assert.ok(earlyResend.body.retryAfterSeconds > 0 && earlyResend.body.retryAfterSeconds <= 120);

  const duplicateSend = await post(base, '/api/auth/send-otp', { email });
  assert.equal(duplicateSend.status, 429);
  assert.equal(duplicateSend.body.error, 'COOLDOWN_ACTIVE');
});