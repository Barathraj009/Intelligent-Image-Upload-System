# DEPLOYMENT — running this as a real project

This document is the runbook for taking the Intelligent Image Upload System
from a localhost college project to a live service. Everything that is
automated in the repo is marked **[done]**. Everything that still needs a
human with an account, a password, or a credit card is under **Manual steps**.

---

## 1. What the repo already has (all [done], verified by `npm test`)

| Item | Where |
| --- | --- |
| Automated test suite (39 tests, no extra deps) | `test/`, `modules/otp-auth/test/`, run via `npm test` |
| CI pipeline (test + audit on push/PR) | `.github/workflows/ci.yml` |
| Container image | `Dockerfile` + `.dockerignore` |
| Render Blueprint (web service + disk + secrets) | `render.yaml` |
| Zero-vuln dependencies (`npm audit` clean) | `package.json` (`nodemailer@9.1.1`) |
| Configurable data directory (`DATA_DIR`) | `db/userStore.js`, `db/imageStore.js` |
| DB-backed `/api/health` (used by platform health checks) | `app.js` |
| Graceful shutdown on `SIGTERM`/`SIGINT` | `app.js` |
| `X-Powered-By` disabled, gallery responses `no-store` | `app.js`, `controllers/imageController.js` |
| Paginated image listing (`?limit`) | `db/imageStore.js`, `controllers/imageController.js` |
| Deploy env template | `.env.example` |

---

## 2. Architecture at a glance

```
Browser  ──HTTPS──▶  Node.js (Express)                 Cloudinary (originals + uploads)
                    │  /                          ▲
                    │  /api/auth      (OTP module) │ OTP email (Gmail SMTP)
                    │  /api/upload    (Multer) ────┘
                    │  /api/images
                    └── SQLite (users + image metadata)
                        └── DATA_DIR (PERSISTENT disk!)
```

Two non-negotiable production rules:

1. **Storage must be persistent.** SQLite lives in `DATA_DIR` (default
   `<repo>/data`). Cloud platforms have ephemeral filesystems — if you don't
   mount a volume/disk, every restart wipes the database. Render: disk at
   `/data` (`render.yaml` is pre-configured). Railway/Fly/Docker: a volume.
2. **No secrets in the repo.** `.env`, `data/` are git-ignored. Set these as
   platform environment variables (or a `.env` you generate for a VPS):

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `CLOUDINARY_URL` | yes | Dashboard → Environment Variable (or `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`) |
   | `GMAIL_USER` | yes | Your sending Gmail address |
   | `GMAIL_APP_PASSWORD` | yes | Google App Password (not your real password) |
   | `OTP_HASH_SECRET` | yes | `openssl rand -hex 32` |
   | `JWT_SECRET` | yes | `openssl rand -hex 32` (different from the above) |
   | `EMAIL_TRANSPORT` | `gmail` | `json` only for local dev |
   | `NODE_ENV` | `production` | secure cookies + full helmet CSP |
   | `DATA_DIR` | `/data` (or your mount path) | must point at the persistent volume |
   | `TRUST_PROXY` | `true` | behind any reverse proxy |
   | `PORT` | `3000` (or platform-injected) | |

---

## 3. Platform guides

### 3.1 Render (easiest — Blueprint included)

1. Push this repo to GitHub.
2. [dashboard.render.com](https://dashboard.render.com/) → **New → Blueprint**
   → connect the repo. It reads `render.yaml` automatically.
3. At first deploy, Render prompts for the `sync: false` secrets
   (`CLOUDINARY_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `OTP_HASH_SECRET`,
   `JWT_SECRET`) — paste the values there.
4. **Important:** the persistent disk in `render.yaml` (mount `/data`, 1 GB)
   requires a **paid** instance. On the **free** plan there is no disk and the
   database resets on every restart — upgrade the instance (Starter is enough)
   before storing real data.
5. Deploy, then wait for **Health Check** to pass against `/api/health`.

### 3.2 Docker / Railway / Fly / VPS

1. Build the image: `docker build -t image-upload-portal .`
2. Run with a volume for the database:

   ```bash
   docker run -d --name image-upload-portal \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e EMAIL_TRANSPORT=gmail \
     -e TRUST_PROXY=true \
     -e GMAIL_USER=you@gmail.com \
     -e GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx \
     -e OTP_HASH_SECRET="$(openssl rand -hex 32)" \
     -e JWT_SECRET="$(openssl rand -hex 32)" \
     -e CLOUDINARY_URL=cloudinary://key:secret@cloud \
     -v volume-name:/data \
     image-upload-portal
   ```

   The container listens on `3000` and writes SQLite to `/data`.
3. Put a TLS-terminating reverse proxy (Railway/Fly do this automatically;
   on a VPS use Caddy/nginx + Let's Encrypt) in front, and set
   `TRUST_PROXY=true`.

### 3.3 Manual / Heroku-style

Plain `node app.js` with `npm ci` as the build command and `node app.js` as
the start command. `engines.node` is `>=18`. Heroku's ephemeral filesystem has
the same persistence warning as Render's free plan.

---

## 4. Post-deploy verification checklist

- [ ] `GET /api/health` → `200 { status: "ok", db: "ok", cloudinaryConfigured: true }`
- [ ] `/` loads the auth page over HTTPS; login via a real Gmail address
      actually lands an email (check the `masked email` response too).
- [ ] Upload an image, confirm it appears in the gallery, reload → still there
      (proves the disk is persisting SQLite).
- [ ] Delete an image → gone from gallery AND from Cloudinary Media Library.
- [ ] Deploy again (auto-redeploy on push) and confirm the gallery still has
      the images (proves persistence across redeploys).
- [ ] Check the service logs: morgan `combined` access logs + structured
      auth logs on stdout.

---

## 5. Operating notes (recommended, not blocking)

- **Backups:** SQLite WAL mode is running. For a live backup stop the
  service and copy `app.db`, or read from a replica/checkpoint:
  `sqlite3 app.db ".backup /path/backup.db"` (warm copy, safe under WAL).
  Schedule a nightly copy of `data/` (db + `-wal` + `-shm`) to object storage.
- **Gmail rate limits:** one Gmail account sends max ~500 emails/day, and
  Google may flag automated volume. For a real launch consider a project
  mailbox + `nosmtp`/transactional provider (SendGrid/Resend) — the module's
  `emailService.js` is the single seam to swap.
- **Cardinality:** `GET /api/images` is capped at 200 rows by default (max
  500). Fine for a classroom project; see scaling below if it grows.

---

## 6. Scaling path (when one instance + SQLite is no longer enough)

Current single-instance design: SQLite (persistent disk) + in-memory OTP
state. This is the correct and cheapest starting point. To scale out:

1. **Multiple instances**
   - Replace in-memory OTP/rate-limit state with **Redis** (`modules/otp-auth` already documents this in `PENDING_WORK.md`).
   - Move image metadata + users to **PostgreSQL** (both `db/*.js` stores are
     isolated seams — only `findOrCreateUser`, `createImageRecord`, `listImages`,
     `findImage`, `deleteImageRecord` touch storage).
   - Cloudinary stays the object store; uploads/deletes remain correct across
     instances because the Cloudinary asset is the source of truth.
2. **Hardening later** — CSRF tokens, CAPTCHA on leads, audit logging, and
   per-project galleries are listed in README "Future Enhancements" and the
   module's `PENDING_WORK.md`.

---

## 7. Who does what

Everything in section 1–6 is implemented and verified in this repo. The only
remaining manual actions are yours because they require your accounts:

1. Provision PostgreSQL/disk alternatives? No — for the default path: upgrade
   the Render plan to paid (persistent disk).
2. Provide the 5 secrets (Cloudinary, Gmail, 2 random secrets).
3. Click Deploy and confirm the post-deploy checklist.

If you give me a target platform + credentials (or a Docker host), I can take
it from "ready" to "live" from here.