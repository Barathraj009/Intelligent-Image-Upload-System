process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'json';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendOtpEmail, getLastTestMessage } = require('../services/emailService');
const config = require('../config/env');

test('sendOtpEmail produces a professional HTML + text message via json transport', async () => {
  await sendOtpEmail('recipient@gmail.com', '123456');

  const message = getLastTestMessage();
  assert.ok(message, 'expected the json transport to capture the message');
  const raw = typeof message === 'string' ? message : JSON.stringify(message);

  assert.match(raw, /Your verification code/);
  assert.match(raw, /123456/);
  assert.match(raw, /expires in 5 minutes/i);
  assert.match(raw, /do not share/i);
  assert.match(raw, new RegExp(config.appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(raw, /recipient@gmail\.com/);
});