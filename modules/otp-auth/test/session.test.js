process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.JWT_EXPIRES_IN = '5m';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, post, get } = require('../testlib/helpers');
const { getLastTestMessage } = require('../services/emailService');
const config = require('../config/env');

let base;
let token;
let cookieLine;

function lastOtp() {
  const message = getLastTestMessage();
  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  return raw.match(/verification code is: (\d{4,8})/i)[1];
}

async function login(email) {
  const sent = await post(base, '/api/auth/send-otp', { email });
  assert.equal(sent.status, 200);
  const verified = await post(base, '/api/auth/verify-otp', { email, otp: lastOtp() });
  assert.equal(verified.status, 200);
  return verified;
}

before(async () => {
  base = await startServer();
});
after(async () => {
  await stopServer();
});

test('verify-otp sets an httpOnly session cookie aligned with the JWT lifetime', async () => {
  const res = await login('cookie@gmail.com');
  token = res.body.token;

  const setCookies = res.headers.getSetCookie();
  assert.ok(setCookies && setCookies.length, 'expected a Set-Cookie header');
  cookieLine = setCookies[0];
  assert.match(cookieLine, new RegExp(`${config.cookie.name}=`));
  assert.match(cookieLine, /HttpOnly/i);
  assert.match(cookieLine, /SameSite=Lax/i);

  // JWT_EXPIRES_IN=5m → cookie Max-Age should track ~300s.
  const maxAge = cookieLine.match(/Max-Age=(\d+)/);
  assert.ok(maxAge, `expected Max-Age in cookie: ${cookieLine}`);
  const seconds = Number(maxAge[1]);
  assert.ok(seconds >= 295 && seconds <= 300, `Max-Age=${seconds} not ~300`);
});

test('GET /session and GET /me identify the authenticated user via Bearer token', async () => {
  const me = await get(base, '/api/auth/me', { Authorization: `Bearer ${token}` });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'cookie@gmail.com');
  assert.equal(me.body.authMethod, 'gmail-otp');
  assert.ok(me.body.verifiedAt, 'expected verifiedAt in session response');
  assert.ok(me.body.expiresAt, 'expected expiresAt in session response');
  const expiresMs = Date.parse(me.body.expiresAt);
  const verifiedMs = Date.parse(me.body.verifiedAt);
  assert.ok(
    expiresMs - verifiedMs >= 4 * 60 * 1000 && expiresMs - verifiedMs <= 5 * 60 * 1000,
    'expiresAt should be ~5m after verifiedAt (JWT_EXPIRES_IN=5m)'
  );

  const session = await get(base, '/api/auth/session', { Authorization: `Bearer ${token}` });
  assert.equal(session.status, 200);
  assert.equal(session.body.email, 'cookie@gmail.com');
});

test('auth responses are never cached (Cache-Control: no-store)', async () => {
  const me = await get(base, '/api/auth/me', { Authorization: `Bearer ${token}` });
  assert.equal(me.headers.get('cache-control'), 'no-store');
  const sent = await post(base, '/api/auth/send-otp', { email: 'nocache@gmail.com' });
  assert.equal(sent.headers.get('cache-control'), 'no-store');
});

test('the same session is honored through the httpOnly cookie', async () => {
  const cookie = cookieLine.split(';')[0];
  const res = await get(base, '/api/auth/me', { Cookie: cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'cookie@gmail.com');
});

test('protected endpoints reject missing / invalid sessions', async () => {
  const none = await get(base, '/api/auth/me');
  assert.equal(none.status, 401);
  assert.equal(none.body.error, 'NOT_AUTHENTICATED');

  const bad = await get(base, '/api/auth/me', { Authorization: 'Bearer not-a-token' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, 'SESSION_EXPIRED');
});

test('logout clears the session cookie', async () => {
  const res = await post(base, '/api/auth/logout', {});
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const setCookies = res.headers.getSetCookie();
  assert.ok(setCookies && setCookies.length, 'expected logout to clear the cookie');
  // Express clearCookie expires the cookie via an epoch Expires header
  // (no Max-Age attribute).
  assert.match(setCookies[0], /Expires=Thu, 01 Jan 1970/i);

  // NOTE: the JWT itself is stateless, so a token a client stored elsewhere
  // (Bearer header / old cookie value replayed manually) stays valid until
  // it expires — this is the documented tradeoff of stateless JWT logout.
  // Browser-held cookies ARE cleared client-side by the header above.
  void token;
});