"use strict";

// Host-application integration tests.
//
// These run the REAL Express app that is shipped to production (app.js + all
// routes + the OTP module with the real user-store adapter). The only
// concessions to a sandboxed test environment:
//   - EMAIL_TRANSPORT=json keeps OTP emails in memory (never sends mail)
//   - DATA_DIR points at a throwaway temp DB (never touches data/app.db)
//
// The env overrides below MUST be set before app.js is required: dotenv only
// fills in vars that are not already present.
//
// A dummy CLOUDINARY_URL keeps the app "configured" so content validation
// runs before any upload would reach Cloudinary (tests never upload for real
// and never call the Cloudinary API).

const os = require("os");
const path = require("path");
const fs = require("fs");

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "iiu-host-test-"));

process.env.NODE_ENV = "test";
process.env.EMAIL_TRANSPORT = "json";
process.env.DATA_DIR = TEMP_DIR;
process.env.CLOUDINARY_URL = "cloudinary://dummy-key:dummy-secret@dummy-cloud";
process.env.OTP_RESEND_COOLDOWN_SECONDS = "0";
process.env.OTP_MAX_ATTEMPTS = "5";
process.env.OTP_MAX_REQUESTS_PER_WINDOW = "100";
process.env.OTP_REQUEST_WINDOW_MINUTES = "60";
process.env.OTP_EXPIRY_MINUTES = "5";
process.env.JWT_EXPIRES_IN = "15m";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const app = require("../app");
const imageStore = require("../db/imageStore");
const userStore = require("../db/userStore");
const emailService = require("../modules/otp-auth/services/emailService");
const authModule = require("../modules/otp-auth");

const COOKIE_NAME = authModule.config.cookie.name;

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  try {
    imageStore.db.close();
  } catch (_error) {
    /* already closed */
  }
  try {
    userStore.db.close();
  } catch (_error) {
    /* already closed */
  }
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

/** Small fetch wrapper: returns { status, json, setCookie, headers }. */
async function req(pathname, { method = "GET", cookie, headers = {}, body } = {}) {
  const merged = { ...headers };
  if (cookie) merged.cookie = cookie;
  const opts = { method, headers: merged };
  if (body !== undefined) {
    merged["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(baseUrl + pathname, opts);
  let json = null;
  try {
    json = await res.json();
  } catch (_error) {
    /* non-JSON body */
  }
  return {
    status: res.status,
    json,
    setCookie: res.headers.get("set-cookie"),
    headers: res.headers,
  };
}

/** Pull the OTP out of the last JSON-transport message for `email`. */
function otpFor(email) {
  const raw = emailService.getLastTestMessage();
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const text = parsed && (parsed.text || (parsed.message && parsed.message.text));
  assert.ok(parsed, "no test message captured");
  const match = String(text || "").match(/verification code is:\s*(\d{6})/i);
  assert.ok(match, "OTP not found in test message");
  return match[1];
}

/** Full sign-in flow → returns the session cookie header value. */
async function signIn(email) {
  const send = await req("/api/auth/send-otp", {
    method: "POST",
    body: { email },
  });
  assert.equal(send.status, 200, "send-otp should succeed");
  const otp = otpFor(email);
  const verify = await req("/api/auth/verify-otp", {
    method: "POST",
    body: { email, otp },
  });
  assert.equal(verify.status, 200, "verify-otp should succeed");
  assert.ok(verify.setCookie, "session cookie should be set");
  return verify.setCookie.split(";")[0];
}

test("GET /api/health reports ok with a reachable database", async () => {
  const r = await req("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.equal(r.json.status, "ok");
  assert.equal(r.json.db, "ok");
});

test("protected APIs reject requests without a session (401)", async () => {
  assert.equal((await req("/api/images")).status, 401);
  assert.equal((await req("/api/upload")).status, 401);
});

test("full sign-in grants access to an empty gallery (no-store)", async () => {
  const cookie = await signIn("fresh.test@gmail.com");
  const r = await req("/api/images", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.equal(r.json.count, 0);
  assert.deepEqual(r.json.images, []);
  assert.match(r.headers.get("cache-control") || "", /no-store/);
});

test("uploads are content-validated before they reach Cloudinary", async () => {
  const cookie = await signIn("upload.test@gmail.com");

  // a text blob masquerading as a PNG
  const fd = new FormData();
  fd.append(
    "images",
    new Blob([Buffer.from("this is definitely not an image")], {
      type: "image/png",
    }),
    "fake.png"
  );
  const bad = await fetch(baseUrl + "/api/upload/multiple", {
    method: "POST",
    headers: { cookie },
    body: fd,
  });
  assert.equal(bad.status, 400);
  const badBody = await bad.json();
  assert.equal(badBody.success, false);

  // no file at all
  const none = await fetch(baseUrl + "/api/upload/multiple", {
    method: "POST",
    headers: { cookie },
    body: new FormData(),
  });
  assert.equal(none.status, 400);
});

test("image listing is paginated and scoped to the owner", async () => {
  const email = "paginate.test@gmail.com";
  const cookie = await signIn(email);

  for (let i = 0; i < 3; i += 1) {
    await imageStore.createImageRecord(email, {
      publicId: `paginate-${i}-${Date.now()}`,
      url: `https://res.cloudinary.com/demo/image/upload/v1/paginate-${i}`,
      originalName: `pic-${i}.png`,
      format: "png",
      width: 10,
      height: 10,
      bytes: 100,
    });
  }

  const all = await req("/api/images", { cookie });
  assert.equal(all.status, 200);
  assert.equal(all.json.count, 3);
  assert.equal(all.json.images.length, 3);

  const capped = await req("/api/images?limit=2", { cookie });
  assert.equal(capped.json.images.length, 2);

  assert.equal(imageStore.listImages("someone-else@gmail.com").length, 0);
});

test("DELETE /api/images/:id enforces ownership before touching Cloudinary", async () => {
  const email = "owner.test@gmail.com";
  const cookie = await signIn(email);

  const rec = await imageStore.createImageRecord(email, {
    publicId: `owner-${Date.now()}`,
    url: "https://res.cloudinary.com/demo/image/upload/v1/owner",
    originalName: "x.png",
    format: "png",
    width: 1,
    height: 1,
    bytes: 10,
  });

  // another user neither sees nor can delete it
  const otherCookie = await signIn("other.test@gmail.com");
  const hidden = await req("/api/images", { cookie: otherCookie });
  assert.ok(!hidden.json.images.some((img) => img.id === rec.id));

  const notYours = await req(`/api/images/${rec.id}`, {
    method: "DELETE",
    cookie: otherCookie,
  });
  assert.equal(notYours.status, 404);

  // malformed id
  const malformed = await req("/api/images/not-a-number", {
    method: "DELETE",
    cookie,
  });
  assert.equal(malformed.status, 400);

  // store-level row deletion (API-level delete also removes the Cloudinary
  // asset, which we don't invoke here to keep tests network-free)
  const removed = imageStore.deleteImageRecord(rec.id, email);
  assert.equal(removed.deleted, true);
});