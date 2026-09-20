process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateOtp, hashOtp, verifyOtpHash, maskEmail } = require('../utils/otpGenerator');

test('generateOtp returns a cryptographically random 6-digit code', () => {
  const otp = generateOtp();
  assert.match(otp, /^\d{6}$/);
  // A sample of 200 codes should contain collisions only by astronomical bad luck.
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(generateOtp());
  assert.ok(seen.size > 100, 'OTPs should not be trivially repetitive');
});

test('generateOtp honors an explicit length', () => {
  assert.match(generateOtp(4), /^\d{4}$/);
  assert.match(generateOtp(8), /^\d{8}$/);
});

test('hashOtp is deterministic per (email, otp) and differs across inputs', () => {
  const a = hashOtp('123456', 'a@gmail.com');
  const b = hashOtp('123456', 'b@gmail.com');
  const c = hashOtp('654321', 'a@gmail.com');
  assert.equal(a, hashOtp('123456', 'a@gmail.com'));
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('verifyOtpHash passes for the right code, fails for wrong ones', () => {
  const stored = hashOtp('123456', 'a@gmail.com');
  assert.equal(verifyOtpHash('123456', 'a@gmail.com', stored), true);
  assert.equal(verifyOtpHash('654321', 'a@gmail.com', stored), false);
  // Email case is normalized inside the hash, matching the app's own
  // normalization — but the email is still bound to the OTP.
  assert.equal(verifyOtpHash('123456', 'A@gmail.com', stored), true);
  assert.equal(verifyOtpHash('123456', 'b@gmail.com', stored), false);
  assert.equal(verifyOtpHash('123456', 'a@gmail.com', 'deadbeef'), false);
});

test('maskEmail keeps only the leading character of the local part', () => {
  assert.equal(maskEmail('john.smith@gmail.com'), 'j*********@gmail.com');
  assert.equal(maskEmail('a@gmail.com'), 'a***@gmail.com');
});