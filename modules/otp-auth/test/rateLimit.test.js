process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.OTP_MAX_REQUESTS_PER_WINDOW = '2';
process.env.OTP_REQUEST_WINDOW_MINUTES = '15';

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

test('limits OTP requests per email within the rolling window', async () => {
  const email = 'burst@gmail.com';

  const one = await post(base, '/api/auth/send-otp', { email });
  const two = await post(base, '/api/auth/send-otp', { email });
  assert.equal(one.status, 200);
  assert.equal(two.status, 200);

  const blocked = await post(base, '/api/auth/send-otp', { email });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'TOO_MANY_REQUESTS');
});

test('rate limiting is per email — other emails are unaffected', async () => {
  const res = await post(base, '/api/auth/send-otp', { email: 'other@gmail.com' });
  assert.equal(res.status, 200);
});