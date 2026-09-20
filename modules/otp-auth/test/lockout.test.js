process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.OTP_MAX_ATTEMPTS = '2';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, post } = require('../testlib/helpers');
const { getLastTestMessage } = require('../services/emailService');

let base;

function lastOtp() {
  const message = getLastTestMessage();
  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  return raw.match(/verification code is: (\d{4,8})/i)[1];
}

before(async () => {
  base = await startServer();
});
after(async () => {
  await stopServer();
});

test('verification locks the account after max attempts, then a resend recovers it', async () => {
  const email = 'lock@gmail.com';
  const sent = await post(base, '/api/auth/send-otp', { email });
  assert.equal(sent.status, 200);
  const correct = lastOtp();

  const first = await post(base, '/api/auth/verify-otp', { email, otp: '000000' });
  assert.equal(first.status, 400);
  assert.equal(first.body.error, 'INVALID_OTP');
  assert.equal(first.body.attemptsRemaining, 1);

  const second = await post(base, '/api/auth/verify-otp', { email, otp: '000000' });
  assert.equal(second.status, 429);
  assert.equal(second.body.error, 'TOO_MANY_ATTEMPTS');

  // Even the correct code is refused while locked.
  const whileLocked = await post(base, '/api/auth/verify-otp', { email, otp: correct });
  assert.equal(whileLocked.status, 429);

  // Resending mints a brand-new OTP that unlocks the account (cooldown=0 here).
  const resended = await post(base, '/api/auth/resend-otp', { email });
  assert.equal(resended.status, 200);
  const recovered = await post(base, '/api/auth/verify-otp', { email, otp: lastOtp() });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.success, true);
});