# AirIndex India OTP Service — Pending Work / Production Readiness Checklist

The **AirIndex India Email-OTP authentication service** is fully
functional end-to-end — every screen, API
endpoint, security control, and error state is implemented, and a 31-test
automated suite covers the flow (see "What was tested"). What follows is an
honest list of the gaps between "working module" and "production-hardened at
scale," in priority order.

## 1. OTP storage layer — currently in-memory (highest priority)

`backend/src/services/otpStore.js` stores OTP/rate-limit records in a
JavaScript `Map` (isolated behind `set / get / getRaw / delete /
incrementAttempts`). This works for a single process but:

- **Data is lost on restart** — any pending OTP or rate-limit window
  disappears.
- **Doesn't work across multiple instances** — behind a load balancer a user
  could hit a different instance on resend/verify and get a "code not
  found" error.

**What to do:** Reimplement those five functions against Redis (recommended —
TTL maps naturally onto OTP expiry) or a DB table with an indexed `email`
column plus scheduled cleanup of expired rows. Nothing else changes; the
interface was designed for exactly this swap.

## 2. User store — currently a demo adapter (install your real one)

The module does **not** ship a production user database. It ships a small
in-memory reference adapter (`src/services/userStore.js`) so the demo works
standalone. For any real project, set your own adapter:

```js
authModule.configure({
  userStore: {
    findOrCreateUser: async (email) => { /* YOUR find-or-create */ },
  },
});
```

This is host-side code (see `INTEGRATION.md`), so it isn't "pending" in the
repo — it's one of the two things every integration must provide.

## 3. Session revocation / logout

Sessions are stateless JWTs. `POST /api/auth/logout` clears the cookie
client-side, but a Bearer token a client stored elsewhere (e.g.
`localStorage`) remains valid until it expires (default 15 min) — there's no
server-side "revoke now" mechanism.

**What to do:** The short expiry keeps this low-risk for most apps. For
immediate revocation (e.g. "log out of all devices"), add a server-side
denylist (Redis keyed by `jti` with the token's remaining TTL) or move to
short-lived access tokens + refresh tokens.

## 4. Email deliverability at scale

Gmail SMTP (personal/Workspace + App Password) is fine for low volume but:
Gmail enforces generous-but-real sending limits and may flag high-volume
automated sending; there's no bounce/complaint handling, retry queue, or
delivery tracking.

**What to do:** For production volume, switch to a transactional provider
(SES, Postgrid, Resend, Postmark, SendGrid, etc.). Only
`backend/src/services/emailService.js#sendOtpEmail` needs to change — it is
the single integration point (the `json` transport already covers offline
tests).

## 5. Observability

Logging goes to stdout via a small redacting logger. There are no
metrics/alerting or request tracing.

**What to do:** Wire the logger into your log aggregator and add counters
for OTP send/verify success/fail and rate-limit hits — these signal a
credential-stuffing attempt in progress.

## 6. CAPTCHA / bot protection

Rate limiting (per-email and per-IP) is implemented, but there's no CAPTCHA
on the email-entry form. A distributed attacker could trigger a slow trickle
of OTP emails up to the per-email ceiling.

**What to do:** Add hCaptcha/reCAPTCHA/Turnstile to the email step for
high-value public-facing deployments.

## 7. CSRF

`SameSite` cookies + JSON-only bodies mitigate CSRF well for most setups.
For strictly public state-changing endpoints, add explicit CSRF token
validation (a `fetch`-set cookie source + a `req` double-submit check or a
CSRF middleware).

## 8. Configuration that's already handled — just needs your real values

- Real Gmail App Password + `OTP_HASH_SECRET` / `JWT_SECRET`
- `CORS_ORIGIN` for your real frontend domain(s)
- `TRUST_PROXY` if behind a reverse proxy / load balancer
- HTTPS termination (the `Secure` cookie flag requires it in production)
- Tuning `OTP_MAX_REQUESTS_PER_WINDOW`, `OTP_RESEND_COOLDOWN_SECONDS`,
  `OTP_MAX_ATTEMPTS`, `JWT_EXPIRES_IN` to your risk tolerance

---

## What was tested

Automated, with Node's built-in test runner (`cd backend && npm test`),
using `createApp()` over HTTP and an offline `json` email transport:

- Email: valid / malformed / empty / non-Gmail rejection; Gmail-only rule
- OTP: send → verify happy path; wrong code + attempts-remaining; attempt
  lockout; resend recovery; expired code; single-use (replay refused);
  cooldown enforcement; per-email rolling-window rate limit
- Auth: first-login user creation; returning-login reuse; no duplicates
  under case variation; email normalization; `GET /session` and `GET /me`
  (with verifiedAt + expiresAt) via Bearer and via httpOnly cookie; missing/
  invalid session rejection; logout clears the cookie; `Cache-Control:
  no-store` on auth responses
- Host adapter: a pluggable `findOrCreateUser` is honored and its payload is
  relayed back verbatim
- Security: OTPs never returned/logged; session cookie is httpOnly + aligned
  Max-Age; redacting logger; constant-time hash verification

**Not exercised here:** a real Gmail SMTP send (offline `json` transport is
used in CI) and a browser click-through. Both are standard paths — do one
real end-to-end run (real Gmail, real inbox) after filling in `.env` and
before shipping.

## Testing new changes

```bash
cd backend
npm test
```