# Integration Guide

This document describes how the Email-OTP authentication service is
integrated into the **AirIndex India** web app, and how the pieces divide
responsibility between the OTP microservice (port 4000) and AirIndex's
FastAPI backend. It walks through the send-otp → verify-otp → token
exchange flow that powers the login page's Email-OTP tab.

## The division of responsibility

```
Auth module (reusable)                    Host application (yours)
─────────────────────                     ─────────────────────────
email validation                          owns the users table
OTP generate/hash/verify                  owns profile/business data
rate limiting + lockout                   decides post-login behavior
session (JWT) issuance                    protects its own routes with
userStore adapter hook                      requireSession
```

The module never stores, reads, or dictates your user data. The only thing
it lets the host plug in for user data is a tiny adapter (below).

---

## 1. Backend integration

### Option A — Mount inside an existing Express app (recommended)

Copy `backend/src/` into your project, e.g. as `src/modules/otp-auth/`, then:

```js
// src/modules/otp-auth/src/index.js  is the public API ("require('./modules/otp-auth')")
const authModule = require('./modules/otp-auth');

const app = require('express')();

authModule.configure({
  userStore: {
    findOrCreateUser: async (email) => {
      const User = require('../models/User');          // YOUR user model
      let user = await User.findByEmail(email);        // email is normalized
      const isNewUser = !user;
      user = user || await User.create({ email });
      user.lastLoginAt = new Date();
      await user.save();
      return { user, isNewUser };                        // shape is up to you
    },
  },
});

app.use('/api/auth', authModule.routes);
app.get('/dashboard', authModule.requireSession, (req, res) => {
  res.json({ email: req.auth.email });
});
```

What happens on login:

```
POST /api/auth/send-otp  → OTP emailed
POST /api/auth/verify-otp → module verifies,
                            → YOUR findOrCreateUser(email) runs,
                            → response: { email, token, expiresAt, verifiedAt, isNewUser, user }
client stores token / cookie
GET  /api/auth/session    (or requireSession on your own routes) → 200
```

### Option B — Run it as its own microservice

Deploy `backend/` on its own port/process. Your main application never
needs to know how OTPs work internally — it only ever needs to:

1. Send users to the auth module's frontend (or embed it).
2. After verification, confirm the session and do your own find-or-create:

```js
const res = await fetch('https://auth.example.com/api/auth/session', {
  headers: { Authorization: `Bearer ${token}` },
});
if (res.ok) {
  const { email } = await res.json();
  // find-or-create in YOUR database, start YOUR session, redirect.
}
```

Or verify the JWT yourself with the shared `JWT_SECRET` — the payload is
`{ email, authMethod, iat, exp }`.

### Environment variables

Copy `backend/.env.example` values into your `.env`. If you namespace them,
edit `src/config/env.js` — it is the single place that reads `process.env`.

### Swapping the OTP storage layer (ephemeral state)

`backend/src/services/otpStore.js` is the *only* file that knows OTPs are
stored in memory. Reimplement `set / get / getRaw / delete /
incrementAttempts` against Redis (recommended — TTL maps naturally onto OTP
expiry) or a database table. Nothing else changes. See `PENDING_WORK.md`.

---

## 2. Frontend integration

### Full page (simplest)

Copy the whole `frontend/` folder into your project (e.g. `/public/auth/`
or `/login/`), then edit **`frontend/js/config.js`**:

```js
window.OtpAuthConfig = {
  apiBaseUrl: '/api/auth',

  appName: 'Acme Dashboard',
  logoUrl: '/img/acme-logo.svg',

  // The post-login destination. Choose ONE:
  onAuthSuccess: (session) => {
    // full control — e.g. store token in your app store, then route
    localStorage.setItem('acme_session', session.token); // your strategy
    window.location.href = '/dashboard';
  },
  // postLoginUrl: '/dashboard',   // simpler: plain redirect
  showDemoDashboard: false,
};
```

That's the entire change needed for most projects.

### Embed inside an existing page

```html
<div id="otp-auth-root"></div>

<link rel="stylesheet" href="/auth/css/styles.css" />
<script src="/auth/js/config.js"></script>
<script src="/auth/js/api.js"></script>
<script src="/auth/js/otpInput.js"></script>
<script src="/auth/js/app.js"></script>
<script>
  window.OtpAuthConfig.apiBaseUrl = '/api/auth';
  window.OtpAuthConfig.onAuthSuccess = (session) => myApp.handleLogin(session);
  OtpAuthModule.mount('#otp-auth-root');
</script>
```

The module renders entirely inside `#otp-auth-root` — safe to embed inside a
modal, a tab, or a route in a single-page app.

### Use it from React/Vue/Angular/etc.

The module has no framework dependency. Call `OtpAuthModule.mount()` in a
mount/`useEffect` hook, pointing at a ref'd container div. It only needs the
DOM node.

---

## 3. CORS and the session cookie

- Different origins? Set `CORS_ORIGIN` to your frontend origin(s),
  comma-separated.
- Cross-origin cookie delivery requires `COOKIE_SAMESITE=none` **and**
  HTTPS (the cookie is marked `Secure` in production).
- Same-origin (or same-site) setups work with the default `SameSite=Lax`.

## 4. Disabling the built-in demo dashboard

Once `onAuthSuccess` (or `postLoginUrl`) is set, set
`showDemoDashboard: false`. The demo dashboard is only for trying the
module standalone.

## 5. Testing your integration

Each project should verify the loop with its real backend, frontend, and a
real Gmail address at least once. The module's own suite (`npm test` in
`backend/`) runs against an offline transport and covers the module's
behavior in isolation — it does not cover YOUR find-or-create logic and
email deliverability, which is why the one real click-through matters.