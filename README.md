# Intelligent Image Upload System

A college project portal for uploading project documentation images securely to cloud storage. Built with **Node.js, Express, Multer, and Cloudinary**, the application validates images, processes them entirely in memory, uploads them to Cloudinary, and dynamically displays the returned secure URLs in a polished, responsive gallery. Access is protected by a **Gmail one-time-password login** backed by a local SQLite user store.

![Status](https://img.shields.io/badge/status-complete-brightgreen)

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Project](#running-the-project)
- [API Documentation](#api-documentation)
- [File Restrictions](#file-restrictions)
- [Security](#security)
- [Storage Architecture](#storage-architecture)
- [Cloudinary Integration](#cloudinary-integration)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Screenshots](#screenshots)
- [Limitations](#limitations)
- [Future Enhancements](#future-enhancements)
- [License](#license)

---

## Overview

A college project portal for uploading project documentation images securely to cloud storage. Built with **Node.js, Express, Multer, and Cloudinary**, the application validates images, processes them entirely in memory, uploads them to Cloudinary, and dynamically displays the returned secure URLs in a polished, responsive gallery. Sign-in is protected by a Gmail one-time-password login backed by a local SQLite user store.

![Status](https://img.shields.io/badge/status-complete-brightgreen)

## Problem Statement

Students preparing college project documentation regularly need to embed images — architecture diagrams, UI screenshots, prototype photos, and result snapshots. Common pain points with ad-hoc approaches are:

- **Local file management** — images scattered across laptops and drives get lost or go out of sync.
- **Slow, manual sharing** — emailing or uploading images one-by-one to reports is tedious.
- **No validation** — wrong formats, oversized files, or accidental non-image uploads break documents.
- **No central gallery** — there is no single place to see every image collected for a project.

## Solution

This system provides a clean portal where a student can upload **one image or a batch of up to 20 images** for their project documents. The application:

1. Validates every upload on the **frontend** (instant feedback) and the **backend** (authoritative checks).
2. Processes images **entirely in memory** — nothing is permanently stored on the server.
3. Streams each image straight to **Cloudinary** cloud storage.
4. Returns **secure HTTPS URLs** that render instantly in a responsive gallery.
5. Handles every failure mode with clear, user-friendly error messages.

The result: a secure, centralized, validated image pipeline suitable for documenting and presenting a college project.

## Key Features

- **Single image upload** — upload one image via file picker or drag & drop.
- **Bulk image upload** — upload up to 20 images in a single request.
- **Drag & drop support** — with visual feedback and keyboard accessibility.
- **Server-side validation** — MIME type, file extension, and 5 MB size limit.
- **Memory-only storage** — Multer `memoryStorage()`; no permanent local files.
- **Cloudinary integration** — streaming uploads from buffers, secure URLs returned.
- **Dynamic gallery** — images render instantly without a page reload.
- **Gmail OTP authentication** — sign in with a one-time email code (reusable auth module), with an `httpOnly` session cookie and a SQLite user store.
- **Protective session gate** — unauthenticated uploads are rejected with `401`.
- **Responsive design** — works on desktop, tablet, and mobile.
- **Comprehensive error handling** — no stack traces or secrets leaked.
- **Security first** — credentials via environment variables, `.env` git-ignored.

## Technology Stack

| Layer          | Technology                                        |
| -------------- | ------------------------------------------------- |
| Runtime        | [Node.js](https://nodejs.org/)                     |
| Backend        | [Express](https://expressjs.com/)                  |
| File uploads   | [Multer](https://github.com/expressjs/multer)      |
| Cloud storage  | [Cloudinary](https://cloudinary.com/)              |
| Authentication | Reusable Gmail OTP module (JWT session, rate-limited) |
| User storage   | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Environment    | [dotenv](https://github.com/motdotla/dotenv)       |
| Frontend       | HTML5, CSS3, Vanilla JavaScript                    |
| Dev tooling    | Nodemon                                            |

## Architecture

```
Browser
   |
   | multipart/form-data
   v
Express.js
   |
   | Multer memoryStorage()
   v
Temporary in-memory buffer
   |
   | upload_stream()
   v
Cloudinary
   |
   | secure_url
   v
Express API response (JSON)
   |
   v
Frontend JavaScript
   |
   v
Dynamic image gallery
```

Because Multer uses `memoryStorage()`, each uploaded image lives in a short-lived in-memory buffer that is streamed straight to Cloudinary. The local server never writes an upload to disk.

## How It Works

1. **Select** — a student picks one or more images using the file picker or drag & drop.
2. **Client-side validation** — the browser instantly rejects unsupported formats and oversized files, and enforces the 20-image bulk limit before anything is sent.
3. **Upload request** — a `multipart/form-data` request is sent to the Express API (`POST /api/upload/single` or `POST /api/upload/multiple`).
4. **Multer interception** — Multer's `memoryStorage()` keeps the files in RAM while its file filter re-validates MIME types, extensions, and the 5 MB / 20-file limits on the server.
5. **Cloudinary upload** — each buffer is streamed to Cloudinary via `upload_stream()` into the `college-project-images` folder.
6. **Secure response** — the API returns Cloudinary's `secure_url` (plus metadata) as JSON.
7. **Dynamic gallery** — the frontend builds image cards from the response and appends them to the gallery without reloading the page.

## Project Structure

```
intelligent-image-upload/
│
├── app.js                        # Express application entry point
├── package.json
├── package-lock.json
├── .env.example                  # Environment template (placeholders only)
├── .gitignore
├── README.md
│
├── config/
│   └── cloudinary.js             # Cloudinary SDK configuration + health checks
│
├── controllers/
│   └── uploadController.js       # Single & bulk upload business logic
│
├── db/
│   └── userStore.js              # SQLite-backed findOrCreateUser for auth module
│
├── middleware/
│   ├── uploadMiddleware.js       # Multer setup (memoryStorage, limits, fileFilter)
│   ├── uploadValidation.js       # Allowed types/extensions/size/count rules
│   └── errorHandler.js           # Centralized error handler
│
├── modules/
│   └── otp-auth/                 # Reusable Gmail OTP auth module (backend)
│       ├── index.js              # Public API (routes, requireSession, configure)
│       ├── app.js                # createApp() factory (for standalone/demo)
│       ├── config/env.js         # Reads all auth env vars
│       ├── controllers/          # authController (send/verify/resend/logout/session)
│       ├── middleware/           # requireSession, validateEmail, rateLimiter, errorHandler
│       ├── routes/authRoutes.js  # /api/auth/* route definitions
│       ├── services/             # otpService, otpStore, sessionService, emailService
│       └── utils/                # otpGenerator (CSPRNG+hashing), asyncHandler, logger
│
├── routes/
│   └── uploadRoutes.js           # /api/upload/* route definitions
│
├── utils/
│   └── cloudinaryUpload.js       # Buffer-to-Cloudinary streaming helper
│
└── public/
    ├── index.html                # Upload portal (post-login application screen)
    ├── style.css                 # Portal styling
    ├── script.js                 # Portal logic, validation, gallery + session gate
    └── auth/                     # Branded Gmail OTP login page (served at /)
        ├── index.html
        ├── css/styles.css        # Rebranded to the host's design tokens
        └── js/                   # config, api, otpInput, app (OtpAuthModule)
```

## Installation

Requirements: **Node.js 18+** and **npm**.

```bash
npm install
```

## Configuration

The application reads Cloudinary credentials and the server port from environment variables. Copy the example file and fill in your own values:

```bash
cp .env.example .env
```

Two credential formats are supported. You can use a single connection URL (copied from **Cloudinary Dashboard > Account Details > Environment Variable**):

```env
PORT=3000
CLOUDINARY_URL=cloudinary://your_api_key:your_api_secret@your_cloud_name
```

Or individual settings:

```env
PORT=3000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

> **Important:** never commit your `.env` file. It is already listed in `.gitignore`. Credentials must never appear in source code, the frontend, or documentation. If a credential has ever been shared (e.g. pasted in a chat or log), rotate it from the Cloudinary dashboard.

### Authentication configuration

The app also requires the Gmail OTP auth module's variables. Merge these into your `.env` (see `.env.example` for the full annotated list):

```env
APP_NAME=Intelligent Image Upload System
EMAIL_TRANSPORT=json
GMAIL_ONLY=true
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=45
OTP_MAX_REQUESTS_PER_WINDOW=5
OTP_REQUEST_WINDOW_MINUTES=15
OTP_HASH_SECRET=change-this-to-a-long-random-string
JWT_SECRET=change-this-to-a-different-long-random-string
JWT_EXPIRES_IN=15m
USE_COOKIE_SESSION=true
COOKIE_NAME=otp_auth_session
COOKIE_SAMESITE=lax
```

- **`EMAIL_TRANSPORT=json`** renders verification emails into memory instead of sending them — ideal for local development. Switch to `gmail` and add a real `GMAIL_USER` + `GMAIL_APP_PASSWORD` (a Google **App Password**, not your login password — see <https://myaccount.google.com/apppasswords>) to send real codes.
- **`OTP_HASH_SECRET`** and **`JWT_SECRET`** are dev placeholders. Generate strong random values (`openssl rand -hex 32`) and use **different** strings for each.

## Running the Project

Production mode:

```bash
npm start
```

Development mode with auto-reload (uses Nodemon):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

- **`/`** — the branded **Gmail OTP login page**. Enter a Gmail address, enter the 6-digit code emailed to you (with `EMAIL_TRANSPORT=json` the code is rendered offline — see *Authentication*), and you're signed in.
- **`/app`** — the upload portal. This route is only useful after login; the page checks your session and redirects unauthenticated visitors back to `/`.
- The **upload API is protected** server-side too (`requireSession`) — unauthenticated requests get `401 NOT_AUTHENTICATED`.

A health check is available at `GET /api/health`, which reports whether Cloudinary is configured.

## API Documentation

All upload endpoints expect `multipart/form-data` requests.

### `POST /api/upload/single`

Uploads a single image.

| Field | Type   | Required | Description        |
| ----- | ------ | -------- | ------------------ |
| image | File   | Yes      | The image file.    |

**Success response (200):**

```json
{
  "success": true,
  "message": "Image uploaded successfully.",
  "image": {
    "originalName": "project.jpg",
    "url": "https://res.cloudinary.com/...",
    "publicId": "college-project-images/...",
    "format": "jpg",
    "width": 1920,
    "height": 1080,
    "bytes": 123456
  }
}
```

### `POST /api/upload/multiple`

Uploads up to 20 images in a single request. Each file is uploaded independently; a failing image does not discard successful uploads from the same batch.

| Field  | Type | Required | Description           |
| ------ | ---- | -------- | --------------------- |
| images | File | Yes      | One or more files.    |

**Success response (200):**

```json
{
  "success": true,
  "message": "Images processed successfully.",
  "uploadedImages": [
    { "originalName": "image1.jpg", "url": "https://res.cloudinary.com/..." }
  ],
  "failedUploads": []
}
```

**Partial success (200):** `failedUploads` lists the images that failed, with reasons.

### `GET /api/health`

Reports server status and Cloudinary configuration state.

### Authentication API (`/api/auth/*`)

Provided by the reusable Gmail OTP auth module. All responses are JSON `{ success: boolean, ... }`.

| Method | Endpoint            | Body                            | Notes                                        |
| ------ | ------------------- | ------------------------------- | -------------------------------------------- |
| POST   | `/api/auth/send-otp`   | `{ "email": "a@gmail.com" }`  | Validates + emails a 6-digit code             |
| POST   | `/api/auth/resend-otp` | `{ "email": "a@gmail.com" }`  | Same rules as send (cooldown + rate limit)    |
| POST   | `/api/auth/verify-otp` | `{ "email": "...", "otp": "123456" }` | Returns a JWT + httpOnly cookie + user record |
| POST   | `/api/auth/logout`     | —                             | Clears the session cookie                     |
| GET    | `/api/auth/session`    | — (needs session)             | Returns the authenticated email + expiry      |
| GET    | `/api/auth/me`         | — (needs session)             | Alias of `/session`                           |

On successful verification the module hands off to this host's SQLite user store (see `db/userStore.js`) — the first login creates the user row, returning logins update `lastLoginAt` — and returns `{ email, token, expiresAt, verifiedAt, isNewUser, user }`.

> OTPs are hashed (HMAC-SHA256), single-use, rate-limited per email and per IP, and never logged. The session is a short-lived JWT (default 15 m) delivered as an `httpOnly` cookie. To switch from offline (`json`) to real Gmail delivery, set `EMAIL_TRANSPORT=gmail` and provide `GMAIL_USER` / `GMAIL_APP_PASSWORD`.

### Error responses

| Status | Meaning                                   |
| ------ | ----------------------------------------- |
| 400    | Invalid request, missing file, bad type   |
| 413    | File exceeds the 5 MB limit               |
| 500    | Server or Cloudinary failure              |

## File Restrictions

| Rule                    | Value                              |
| ----------------------- | ---------------------------------- |
| Allowed formats         | JPG, JPEG, PNG, WEBP, GIF          |
| Maximum file size       | 5 MB per image                     |
| Maximum bulk count      | 20 images per request              |

Unsupported files (PDF, DOC, DOCX, ZIP, EXE, MP3, MP4, arbitrary binaries) are rejected by both frontend and backend validation.

## Security

- **Credentials live only in the environment** — loaded via `dotenv`, never hard-coded, never sent to the frontend, never committed.
- **`.env` is git-ignored** — `.gitignore` prevents accidental commits.
- **Backend validation is authoritative** — MIME type and extension checks, size limits, and file-count limits run on the server regardless of client-side checks.
- **No permanent local storage** — uploaded images are processed in memory only. (User accounts are the exception: they're stored in a local SQLite file, `data/app.db`, which is git-ignored.)
- **Gmail OTP authentication** — the upload API is protected by `requireSession`; unauthenticated requests get `401`. OTPs are generated from a CSPRNG, stored only as HMAC hashes, verified in constant time, deleted after first use (no replay), rate-limited per email and per IP, and never logged. Sessions are short-lived JWTs (default 15 m) delivered as `httpOnly` cookies.
- **Safe error messages** — the API never returns stack traces or secrets.
- **Safe DOM rendering** — the gallery is built with `createElement`/`textContent`, avoiding unsafe HTML injection.

## Storage Architecture

Multer is configured with `memoryStorage()`, so uploaded files live in an in-memory buffer for the duration of the request and are streamed directly to Cloudinary. This means:

- No permanent upload directory on the server.
- No cleanup jobs, disk usage, or orphaned temp files.
- Instant streaming to cloud storage for a cleaner, safer deployment.

## Cloudinary Integration

The `utils/cloudinaryUpload.js` helper wraps Cloudinary's `upload_stream` in a Promise so it composes cleanly with `async/await`:

```js
const uploadStream = cloudinary.uploader.upload_stream(
  { folder: "college-project-images", resource_type: "image" },
  callback
);
uploadStream.end(file.buffer);
```

Images are organized under the `college-project-images` folder, and responses return Cloudinary's `secure_url` for HTTPS delivery.

## Error Handling

- **Multer errors** (`LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, ...) are translated into safe, specific HTTP responses.
- **Cloudinary errors** are surfaced as user-friendly messages with appropriate status codes.
- **Unexpected errors** are logged on the server and returned as a generic safe message.
- **Frontend** handles timeout, network failure, and non-JSON responses gracefully.
- **Bulk uploads** track success and failure per-file, so one failure never wipes out a batch.

## Testing

The application was verified with the following checks:

1. Application starts without errors.
2. Frontend loads correctly at `http://localhost:3000`.
3. Single JPG/PNG uploads — validated and uploaded to Cloudinary.
4. Bulk upload of multiple images — full success verified.
5. Rejection of invalid file types (PDF, spoofed executables).
6. Rejection of files over 5 MB.
7. Rejection of more than 20 files.
8. Safe handling of malformed requests.
9. Cloudinary failures handled without crashing (tested with invalid credentials).
10. Server restarts cleanly.
11. No local permanent storage of uploaded images.
12. **Real Cloudinary uploads were verified end-to-end** — images were uploaded via the API, secure URLs returned and confirmed live over HTTPS, then removed from the account after testing.
13. **Gmail OTP auth flow verified end-to-end** — send-otp → OTP captured from the offline transport → verify-otp → JWT + `httpOnly` cookie issued → `/session` confirms the email → first login creates the SQLite user, returning login updates it → unauthenticated uploads rejected with `401`, authenticated uploads pass the guard.

## Screenshots

> Screenshots to be added. The application shows a two-card upload panel (single + bulk), drag & drop zones, and a responsive CSS Grid gallery of uploaded images.

## Limitations

- **No persistent gallery** — uploaded images are stored in Cloudinary, but the on-page gallery only lists images uploaded during the current browser session. A database or a listing endpoint would be required for a permanent "all uploads" view.
- **No moderation/review workflow** — uploads go straight to the cloud and are publicly accessible via their URLs.
- **OTP state is in-memory** — verification codes and rate-limit windows live in the server's memory (module default). A restart clears pending codes; multi-instance deployments need Redis/DB storage (see the module's `PENDING_WORK.md`).
- **Offline email by default** — `EMAIL_TRANSPORT=json` doesn't actually deliver email; switch to `gmail` with a real App Password for real codes.
- **Dependency audit note** — `npm audit` reports advisories for the vendored `nodemailer@6.10.1` (mail-composition path). They are not reachable in the current configuration: the module only emails a validated, Gmail-only recipient and `EMAIL_TRANSPORT=json` never sends mail. Upgrade to `nodemailer@10` (breaking) when real Gmail SMTP is enabled.
- **Localhost by default** — the project runs locally; deployment to a hosting platform is left to the user.

## Future Enhancements

- **Role-based authorization** — instructor/admin roles beyond email verification.
- **Student & project association** — link each image to a project record.
- **Database integration** — persist upload metadata (PostgreSQL / MongoDB).
- **Image deletion & management** — remove images from Cloudinary via the API.
- **Search & filtering** — filter the gallery by project, date, or tag.
- **Image optimization** — automatic resizing/compression transforms via Cloudinary.
- **Upload progress bars** — per-file progress with `XMLHttpRequest` or resumable uploads.
- **Project-specific galleries** — separate galleries per project/document.

## License

MIT
