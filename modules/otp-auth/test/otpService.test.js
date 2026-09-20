process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';
process.env.OTP_MAX_ATTEMPTS = '3';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '30';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const otpService = require('../services/otpService');
const store = require('../services/otpStore');
const { getLastTestMessage } = require('../services/emailService');
const config = require('../config/env');

function lastOtp() {
  const message = getLastTestMessage();
  assert.ok(message, 'expected an email to have been "sent"');
  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  const match = raw.match(/verification code is: (\d{4,8})/i);
  assert.ok(match, `could not find OTP in test message: ${raw.slice(0, 200)}`);
  return match[1];
}

test('requestOtp sends an OTP email and never returns the code', async () => {
  const result = await otpService.requestOtp('alpha@gmail.com');
  assert.equal(result.maskedEmail, 'a****@gmail.com');
  assert.equal(result.expiresInSeconds, config.otp.expiryMinutes * 60);
  assert.equal(result.resendCooldownSeconds, 30);
  assert.equal('otp' in result, false, 'response must not contain the OTP');
  assert.match(lastOtp(), /^\d{6}$/);
});

test('requestOtp enforces the resend cooldown', async () => {
  const { OtpServiceError, OtpError } = otpService;
  await otpService.requestOtp('bravo@gmail.com');
  try {
    await otpService.requestOtp('bravo@gmail.com');
    assert.fail('expected a cooldown error');
  } catch (err) {
    assert.ok(err instanceof OtpServiceError);
    assert.equal(err.code, OtpError.COOLDOWN);
    assert.ok(err.meta.retryAfterSeconds > 0);
  }
});

test('verifyOtp succeeds with the emailed code, then forbids reuse', async () => {
  await otpService.requestOtp('charlie@gmail.com');
  const otp = lastOtp();
  assert.equal(await otpService.verifyOtp('charlie@gmail.com', otp), true);

  // The record was deleted on success → replay must look "expired".
  try {
    await otpService.verifyOtp('charlie@gmail.com', otp);
    assert.fail('expected replay to fail');
  } catch (err) {
    assert.equal(err.code, otpService.OtpError.EXPIRED);
  }
});

test('verifyOtp rejects wrong codes and locks after maxAttempts', async () => {
  await otpService.requestOtp('delta@gmail.com');
  const otp = lastOtp();

  function expect(code) {
    try {
      otpService.verifyOtp('delta@gmail.com', '000000');
      assert.fail('expected a verify error');
    } catch (err) {
      assert.equal(err.code, code);
    }
  }

  // maxAttempts=3: failures 1-2 stay INVALID, failure 3 locks the record.
  expect(otpService.OtpError.INVALID);
  expect(otpService.OtpError.INVALID);
  expect(otpService.OtpError.LOCKED);

  const record = store.getRaw('delta@gmail.com');
  assert.equal(record.attempts, 3);
  assert.equal(record.locked, true);

  // Locked → even a correct code is refused.
  try {
    otpService.verifyOtp('delta@gmail.com', otp);
    assert.fail('expected a lock error');
  } catch (err) {
    assert.equal(err.code, otpService.OtpError.LOCKED);
  }
});

test('verifyOtp reports expired codes as expired, not brute-forceable', async () => {
  await otpService.requestOtp('echo@gmail.com');
  const otp = lastOtp();

  const record = store.getRaw('echo@gmail.com');
  store.set('echo@gmail.com', { ...record, expiresAt: Date.now() - 1000 });

  try {
    await otpService.verifyOtp('echo@gmail.com', otp);
    assert.fail('expected an expiry error');
  } catch (err) {
    assert.equal(err.code, otpService.OtpError.EXPIRED);
  }
});

test('a failed email send must not overwrite the previous valid OTP', async () => {
  const emailService = require('../services/emailService');
  const original = emailService.sendOtpEmail;

  await otpService.requestOtp('foxtrot@gmail.com');
  const before = store.getRaw('foxtrot@gmail.com');
  store.set('foxtrot@gmail.com', { ...before, lastSentAt: 0 }); // bypass cooldown

  emailService.sendOtpEmail = async () => {
    throw new Error('boom');
  };
  try {
    try {
      await otpService.requestOtp('foxtrot@gmail.com');
      assert.fail('expected a send failure');
    } catch (err) {
      assert.equal(err.code, otpService.OtpError.EMAIL_FAILED);
    }
  } finally {
    emailService.sendOtpEmail = original;
  }

  // The pre-existing valid record was left fully intact.
  const after = store.getRaw('foxtrot@gmail.com');
  assert.equal(after.otpHash, before.otpHash);
  assert.ok(after.expiresAt > Date.now());
});