# AirIndex India Email-OTP Authentication Service

The **AirIndex India** login module. A standalone email one-time-password
authentication microservice (port 4000) used by the AirIndex India
Real-time Airfare Price Index web app. It exposes `/api/auth/send-otp`,
`/api/auth/verify-otp`, and `/api/auth/logout`, and returns a JWT that
AirIndex India's FastAPI backend exchanges via `POST /api/auth/otp/exchange`
(find-or-create user, issue standard AirIndex tokens).

Built from the reusable Gmail OTP module:

```
Enter Gmail → Send code → OTP emailed → Enter code → Verify → ✓ Authenticated → Continue to app
```

without rebuilding login, OTP verification, or session logic from scratch —
**build once, integrate into many projects**.

```
                 REUSABLE AUTH MODULE
                         │
              ┌──────────┴──────────┐
              │                     │
          Email Login            OTP System
              │                     │
              └──────────┬──────────┘
                         │
                    Verification
                         │
                   Authentication
                         │
                         ▼
                 Host Application        ← the project you integrate into
                         │
                         ▼
                Host Application DB      ← YOUR users table (module never ships one)
                         │
                         ▼
                    User Account
```

The module owns the **authentication mechanism**. The host application owns
the **user's application data**. That separation is the whole point.

---

## What's included

```
gmail-otp-auth/
├── backend/          Node.js + Express API (OTP generation, email, sessions, user-store hook)
│   ├── server.js         Standalone demo bootstrapper
│   └── src/
│       ├── app.js        createApp() factory — also what tests and hosts use
│       ├── index.js      Public API for host apps (routes, requireSession, configure, userStore)
│       ├── config/       env.js   — one place for all environment settings
│       ├── controllers/  authController.js
│       ├── middleware/   auth.js (requireSession), validateEmail, rateLimiter, errorHandler
│       ├── routes/       authRoutes.js
│       ├── services/     otpService, otpStore, userStore, emailService, sessionService
│       └── utils/        otpGenerator (CSPRNG+hashing), logger (redacting), asyncHandler
├── frontend/          Framework-agnostic HTML/CSS/JS UI (no build step)
│   └── js/            config.js (integration point), api.js, otpInput.js, app.js
└── docs              README.md (this), INTEGRATION.md, PENDING_WORK.md
```

- **Backend**: CSPRNG OTP generation, OTPs stored as HMAC-SHA256 hashes,
  Gmail SMTP delivery via Nodemailer, per-email + per-IP rate limiting,
  attempt lockout, JWT session issuance (httpOnly cookie), and a pluggable
  **user store** so the host app's own database owns its users.
- **Frontend**: a single mountable module (`OtpAuthModule.mount(...)`) —
  email entry, 6-box OTP input with auto-advance, countdown timers, error/
  success/loading states, change-email + resend, and a configurable
  post-login destination. Vanilla JS; no framework or bundler required.

---

## Quick start (standalone demo)

**1. Install backend dependencies**

```bash
cd backend
npm install
```

**2. Configure environment variables**

```bash
cp .env.example .env
```

Fill in:

- `GMAIL_USER` — the Gmail address that *sends* the OTP emails
- `GMAIL_APP_PASSWORD` — a Google **App Password** (not your normal password).
  Generate one at <https://myaccount.google.com/apppasswords> (requires
  2-Step Verification enabled on that Gmail account).
- `OTP_HASH_SECRET` and `JWT_SECRET` — two different long random strings
  (e.g. `openssl rand -hex 32`).

**3. Run the server**

```bash
npm start          # or: npm run dev (auto-reload on change)
```

**4. Open the demo**

Visit **http://localhost:4000** — the backend serves the demo frontend
directly, so the whole flow works with nothing else running. Enter a real
Gmail address, check your inbox for the code, and verify.

> **No Gmail yet?** Set `EMAIL_TRANSPORT=json` in `.env`. The server renders
> the OTP email into memory instead of sending it — perfect for trying the
> UI/flow offline. Never use `json` in production.

---

## How Gmail OTP works

1. User submits their Gmail address.
2. Server validates the address (format + optional Gmail-only domain rule).
3. Server generates a **6-digit OTP using `crypto.randomInt`** (CSPRNG).
4. The OTP is **never stored in plain text** — a keyed HMAC-SHA256 hash is
   kept in the OTP store (in-memory by default, swappable — see below).
5. The OTP is emailed to the user via Gmail SMTP with a clean HTML + text
   template.
6. The user enters the code; the server compares it in **constant time**
   against the stored hash.
7. On success the OTP record is **deleted immediately** (no replay), and the
   module hands off to the host application with an authenticated session.

---

## API reference

All endpoints are mounted under `/api/auth`.

| Method | Endpoint       | Body                               | Notes                                             |
|--------|----------------|------------------------------------|---------------------------------------------------|
| POST   | `/send-otp`    | `{ "email": "a@gmail.com" }`       | Generates + emails a new OTP                      |
| POST   | `/resend-otp`  | `{ "email": "a@gmail.com" }`       | Same rules as send-otp (cooldown + rate limit)    |
| POST   | `/verify-otp`  | `{ "email": "...", "otp": "123456" }` | Returns a session token + user hand-off on success |
| POST   | `/logout`      | —                                  | Clears the session cookie                         |
| GET    | `/session`     | — (needs session)                  | Who is authenticated right now                    |
| GET    | `/me`          | — (needs session)                  | Alias of `/session`                               |
| GET    | `/health`      | —                                  | Liveness probe                                    |

`/verify-otp` success response:

```json
{
  "success": true,
  "message": "Email verified successfully.",
  "email": "a@gmail.com",
  "token": "<jwt>",
  "expiresAt": 1767229200000,
  "verifiedAt": "2026-01-01T00:00:00.000Z",
  "isNewUser": true,
  "user": { "id": "u_abc123", "email": "a@gmail.com", "createdAt": "...", "lastLoginAt": "..." }
}
```

`user` is whatever **your** user store returns — the module never
inspects it, it just relays it. `isNewUser` tells the host app whether this
was a first login.

Every response is JSON: `{ "success": boolean, ... }`. Errors carry a stable
`error` code plus a user-friendly `message`.

### Error codes

| Code                 | Meaning                                          |
|----------------------|--------------------------------------------------|
| `EMAIL_REQUIRED`     | No email sent                                    |
| `EMAIL_INVALID`      | Malformed email                                  |
| `EMAIL_NOT_GMAIL`    | Not a Gmail address (when `GMAIL_ONLY=true`)     |
| `COOLDOWN_ACTIVE`    | Resend too soon (see `retryAfterSeconds`)        |
| `TOO_MANY_REQUESTS`  | Per-email / per-IP rate limit hit                |
| `EMAIL_DELIVERY_FAILED` | OTP email could not be sent                   |
| `OTP_FORMAT_INVALID` | OTP not 4–8 digits                               |
| `OTP_EXPIRED`        | OTP missing, expired, or already used            |
| `INVALID_OTP`        | Wrong code (see `attemptsRemaining`)             |
| `TOO_MANY_ATTEMPTS`  | Attempt limit reached — request a new code       |
| `NOT_AUTHENTICATED`  | Session required but missing                     |
| `SESSION_EXPIRED`    | Session token invalid/expired                    |

---

## Database integration

**The module ships with NO database and never forces one on a project.**

Two distinct pieces of state exist, and they are deliberately separate:

### 1. OTP/rate-limit state — owned by the auth module (ephemeral)

`backend/src/services/otpStore.js` keeps OTPs + rate-limit windows. It is an
**in-memory `Map`** by default, isolated behind five functions:
`set / get / getRaw / delete / incrementAttempts`. For multi-instance or
restart-safe deployments, reimplement those five functions against Redis or
a table with an indexed `email` column. Nothing else in the codebase needs
to change.

### 2. User accounts — owned by the HOST application

After OTP verification succeeds, the module calls a `userStore` adapter you
provide. You decide what happens:

- **First login** → your code creates the user row.
- **Returning login** → your code updates `lastLoginAt`.
- The email is normalized to lowercase and should have a **UNIQUE**
  constraint in your table so duplicates are impossible at the DB level.

The default (demo) user store is a tiny in-memory reference implementation
so the module works standalone. **Replace it with your database adapter**
(see below) the moment you integrate.

---

## How to Integrate This Module Into a New Project

This is the section that matters. There are two integration styles —
pick whatever fits your architecture:

### Option A — Your backend is also Express (simplest, tightest)

**1. Copy the module into your project.**

```
my-project/
├── src/
│   ├── modules/
│   │   └── otp-auth/          ← the backend/ folder contents (or as submodule)
│   └── app.js
├── public/auth/               ← the frontend/ folder contents
└── .env                       ← merge the module's env vars in
```

**2. Mount the routes and plug in your user adapter.**

`src/app.js`:

```js
const express = require('express');
const authModule = require('./modules/otp-auth'); // backend/src/index.js

// YOUR users table adapter — the ONLY host-side code the module demands.
const User = require('./models/User');

authModule.configure({
  userStore: {
    // Module calls this right after a successful OTP verification.
    findOrCreateUser: async (email) => {
      // First login → create. Returning login → update last login.
      let user = await User.findOne({ email });            // email is normalized
      const isNewUser = !user;
      if (!user) {
        user = await User.create({ email, /* your fields */ });
      } else {
        user.lastLoginAt = new Date();
        await user.save();
      }
      return { user, isNewUser };
    },
  },
});

const app = express();
app.use('/api/auth', authModule.routes);      // the whole auth API

// Protect your own routes with the module's session guard:
app.get('/dashboard', authModule.requireSession, (req, res) => {
  // req.auth = { email, authMethod, iat, exp }
  res.json({ email: req.auth.email });
});
```

**3. Serve the frontend from one of your routes** (or mount the whole
`createApp()` — see the `src/index.js` docs) and point
`frontend/js/config.js` at your hook:

```js
window.OtpAuthConfig = {
  apiBaseUrl: '/api/auth',
  appName: 'Acme Dashboard',
  onAuthSuccess: (session) => {
    // session = { email, token, verifiedAt, isNewUser, user }
    window.location.href = '/dashboard';   // your real destination
  },
  // or, if a plain redirect is enough:
  postLoginUrl: '/dashboard',
  showDemoDashboard: false,
};
```

Done. Your `.env` needs the module's variables (see `.env.example`);
`require('./modules/otp-auth')` reads names like `JWT_SECRET`,
`GMAIL_USER`, `OTP_HASH_SECRET`, etc.

### Option B — Run the module as its own microservice (loosest coupling)

Deploy `backend/` on its own port/process. Send users to the module's
frontend (or embed it). After verification, the module redirects back with a
session token. Your main backend then:

```js
// Your main backend, on its own:
const res = await fetch('https://auth.example.com/api/auth/session', {
  headers: { Authorization: `Bearer ${redirectToken}` },
});
const { email, authMethod } = await res.json();   // 200 = verified

// Now do your find-or-create against YOUR database and start YOUR session.
```

Alternatively verify the JWT yourself with any library using the shared
`JWT_SECRET` — the payload is `{ email, authMethod, iat, exp }`.

> Either way the **users table stays in YOUR database**. The module never
> sees, writes, or mandates a schema for your application data.

### Option C — Frontend-only embed (React/Vue/SPA)

The frontend is framework-agnostic. Copy `frontend/`, drop the CSS + 4 JS
files into your SPA, render `<div id="otp-auth-root">`, and call
`OtpAuthModule.mount('#otp-auth-root', config)` in a mount/`useEffect`
hook. It only needs the DOM node — it never touches the rest of your page.

### Configuring the post-login destination

Nothing about the destination is hardcoded. Priority when the user clicks
**Continue to application →**:

1. `onAuthSuccess(session)` — a callback for full control (recommended for
   SPAs), or
2. `postLoginUrl` — a plain redirect target, or
3. the built-in demo dashboard (dev/demo only).

---

## Security features

- OTPs generated with `crypto.randomInt` (CSPRNG), never `Math.random()`
- OTPs stored as HMAC-SHA256 hashes, never plain text — even a memory dump
  can't expose a usable code
- Constant-time comparison on verification (no timing side-channel)
- OTP deleted immediately on success → no replay; expired codes are useless
- Per-email resend cooldown + rolling-window send cap
- Per-IP rate limiting on both send and verify endpoints
- Attempt lockout per code (`OTP_MAX_ATTEMPTS`)
- Session = short-lived JWT via `httpOnly` cookie; `Secure` in production,
  configurable `SameSite`
- OTPs are never returned in API responses and never logged
- All secrets externalized to `.env`; nothing sensitive is committed
- CSRF is mitigated by `SameSite` cookies + JSON-only bodies; enable
  explicit CSRF tokens for strictly public state-changing endpoints
- `helmet` security headers, 10kb JSON body limit, friendly error handling
  (raw/internal errors never reach the client)

---

## Security: limits you should understand

| Control              | Env var                     | Default |
|----------------------|-----------------------------|---------|
| OTP length           | `OTP_LENGTH`                | 6       |
| OTP lifetime         | `OTP_EXPIRY_MINUTES`        | 5       |
| Wrong-code lockout   | `OTP_MAX_ATTEMPTS`          | 5       |
| Resend cooldown      | `OTP_RESEND_COOLDOWN_SECONDS` | 45    |
| Max sends / window   | `OTP_MAX_REQUESTS_PER_WINDOW` + `OTP_REQUEST_WINDOW_MINUTES` | 5 / 15m |
| Session lifetime     | `JWT_EXPIRES_IN`            | 15m     |
| IP send cap          | (hardcoded)                 | 20 / 15m |
| IP verify cap        | (hardcoded)                 | 40 / 15m |

---

## Production deployment checklist

1. `NODE_ENV=production`
2. Long random `OTP_HASH_SECRET` and `JWT_SECRET`
3. Real Gmail App Password (or swap `emailService.js` for a transactional
   provider — it's a single function)
4. HTTPS termination (the `Secure` cookie flag requires it)
5. `CORS_ORIGIN` = your real frontend origin(s)
6. `TRUST_PROXY` set if you're behind a reverse proxy / load balancer
7. Replace the in-memory `otpStore` with Redis/DB for multi-instance +
   restart-safe behavior
8. Replace the demo user store with your database adapter
9. See `PENDING_WORK.md` for the full gaps list

---

## Testing

```bash
cd backend
npm test
```

32 tests (Node's built-in runner, no extra deps) using an in-process
`createApp()` and an offline email transport. Coverage includes: email
validation, OTP happy path, replay prevention, wrong-code lockout, expiry,
resend cooldown, per-email rate limits, session cookie security, `/session`
and `/me`, logout, first-vs-returning login, duplicate prevention, email
normalization, and the host user-store adapter contract.

## Troubleshooting

- **"Email sending will fail until these are configured" at boot** — add
  `GMAIL_USER` / `GMAIL_APP_PASSWORD` to `.env`, or use `EMAIL_TRANSPORT=json`
  for offline testing.
- **Email never arrives** — App Passwords require 2-Step Verification on the
  Gmail account; check for delivery in Spam; Gmail free accounts are limited.
- **Cookie not set in the browser** — frontend and API must be same-origin,
  or `COOKIE_SAMESITE=none` + HTTPS + `CORS_ORIGIN` pointing at the frontend.
- **`req.ip` seems wrong in rate-limit errors** — set `TRUST_PROXY` for
  proxy deployments.
- **"code already used" on retry** — OTPs are single-use by design; request
  a new one.

## License

MIT — use this however you like in your own projects.