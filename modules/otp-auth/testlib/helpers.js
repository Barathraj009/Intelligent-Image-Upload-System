/**
 * Shared test bootstrap.
 * NOTE: each test file MUST set its own process.env overrides BEFORE
 * requiring this helper, because src/config/env.js reads process.env once
 * at require time (each test file runs in its own process).
 */
const { createApp } = require('../app');

let server;

async function startServer() {
  const app = createApp({ serveDemo: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
}

async function post(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, headers: res.headers };
}

async function get(baseUrl, path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, headers: res.headers };
}

module.exports = { startServer, stopServer, post, get };