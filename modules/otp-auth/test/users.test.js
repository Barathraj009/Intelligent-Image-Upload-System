process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, post } = require('../testlib/helpers');
const { getLastTestMessage } = require('../services/emailService');
const authModule = require('../index');
const { normalizeEmail } = require('../services/userStore');

let base;

function lastOtp() {
  const message = getLastTestMessage();
  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  return raw.match(/verification code is: (\d{4,8})/i)[1];
}

async function login(email) {
  const sent = await post(base, '/api/auth/send-otp', { email });
  assert.equal(sent.status, 200);
  return post(base, '/api/auth/verify-otp', { email, otp: lastOtp() });
}

before(async () => {
  base = await startServer();
});
after(async () => {
  await stopServer();
});

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  User@Gmail.COM '), 'user@gmail.com');
  assert.equal(normalizeEmail('A@b.com'), 'a@b.com');
});

test('first login creates a user; returning login reuses it (no duplicates)', async () => {
  const first = await login('repeat@gmail.com');
  assert.equal(first.status, 200);
  assert.equal(first.body.isNewUser, true);
  const userId = first.body.user.id;

  const second = await login('REPEAT@gmail.com'); // case-normalized on purpose
  assert.equal(second.status, 200);
  assert.equal(second.body.isNewUser, false);
  assert.equal(second.body.user.id, userId, 'one email address must map to one account');
  assert.equal(second.body.email, 'repeat@gmail.com');
});

test('emails sent with mixed case still verify (server normalizes)', async () => {
  const sent = await post(base, '/api/auth/send-otp', { email: ' Case@Gmail.com ' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.maskedEmail, 'c***@gmail.com');

  const verified = await post(base, '/api/auth/verify-otp', {
    email: 'case@gmail.com',
    otp: lastOtp(),
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.email, 'case@gmail.com');

  const existing = await post(base, '/api/auth/verify-otp', { email: 'case@gmail.com', otp: '000000' });
  assert.equal(existing.status, 400, 'the first verification consumed the code — no crash');
});

test('a host can plug in its own user store via the module public API', async () => {
  // Simulates a real host database adapter (the only host-side code needed).
  const calls = [];
  let counter = 0;
  const hostUsers = new Map();

  authModule.configure({
    userStore: {
      findOrCreateUser: async (email) => {
        calls.push(email);
        let user = hostUsers.get(email);
        const isNewUser = !user;
        user = user || { id: `host_${++counter}`, email, profile: { name: 'Host User' } };
        hostUsers.set(email, user);
        return { user, isNewUser };
      },
    },
  });

  const first = await login('hostintegrated@gmail.com');
  assert.equal(first.status, 200);
  assert.equal(first.body.isNewUser, true);
  assert.deepEqual(first.body.user.profile, { name: 'Host User' }); // host payload relayed verbatim
  assert.deepEqual(calls, ['hostintegrated@gmail.com']);

  const second = await login('hostintegrated@gmail.com');
  assert.equal(second.status, 200);
  assert.equal(second.body.isNewUser, false);
  assert.equal(second.body.user.id, 'host_1');
  assert.equal(calls.length, 2);
});