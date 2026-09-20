require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const uploadRoutes = require("./routes/uploadRoutes");
const imageRoutes = require("./routes/imageRoutes");
const errorHandler = require("./middleware/errorHandler");
const { isConfigured, getMissingConfig } = require("./config/cloudinary");

const authModule = require("./modules/otp-auth");
const userStore = require("./db/userStore");

authModule.configure({
  userStore: {
    findOrCreateUser: userStore.findOrCreateUser,
  },
});

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

// Trust proxy — needed for express-rate-limit and x-forwarded-for behind a
// reverse proxy (Heroku, Railway, nginx, Cloudflare, etc.).
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === "true") {
  app.set("trust proxy", true);
} else if (trustProxy) {
  app.set("trust proxy", trustProxy);
}

// Security headers via helmet.  upgrade-insecure-requests is disabled in
// development so http://localhost resources aren't forced to https://.
if (isProd) {
  app.use(helmet());
} else {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "upgrade-insecure-requests": null,
          "img-src": ["'self'", "data:", "https:"],
          "font-src": ["'self'", "https:", "data:"],
        },
      },
    })
  );
}

// Request logging — combined (Apache-style) in production, concise in dev.
app.use(morgan(isProd ? "combined" : "dev"));

// Body parsers — auth endpoints receive only {email} and {email,otp}, so a
// 10 kB cap is more appropriate than body-parser's default 100 kB.
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use(cookieParser());

// index: false prevents Express from automatically serving public/index.html
// at "/" so the explicit / and /app routes below can choose which page to send.
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  const missing = getMissingConfig();
  res.status(200).json({
    success: true,
    status: "ok",
    cloudinaryConfigured: isConfigured,
    cloudinaryMissingConfig: missing,
    uptime: process.uptime(),
  });
});

app.use("/api/auth", authModule.routes);

// Upload API — protected + rate-limited
app.use(
  "/api/upload",
  authModule.requireSession,
  require("./middleware/uploadLimit").uploadLimiter,
  require("./middleware/uploadLimit").inFlightCap(),
  uploadRoutes
);

// Image list & delete — protected
app.use(
  "/api/images",
  authModule.requireSession,
  imageRoutes
);

// ---------------------------------------------------------------------------
// Page routes (server-side session gate for /app)
// ---------------------------------------------------------------------------

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth", "index.html"));
});

app.get("/app", (req, res, next) => {
  // Server-side gate: reject unauthenticated visitors before serving the
  // portal HTML.  We replicate the cookie check here so the user is
  // redirected to the login page without a flash of protected content.
  const cookieName = authModule.config.cookie.name;
  const token =
    (req.cookies && req.cookies[cookieName]) ||
    (req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);

  if (!token) return res.redirect("/");

  const jwt = require("jsonwebtoken");
  try {
    jwt.verify(token, authModule.config.jwt.secret);
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  } catch (_e) {
    return res.redirect("/");
  }
});

// 404 for unknown /api/* routes
app.use("/api", (_req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Intelligent Image Upload System running on http://localhost:${PORT}`
  );

  if (!isConfigured) {
    console.warn(
      "Warning: Cloudinary is not fully configured. Missing: " +
        getMissingConfig().join(", ") +
        ". See .env.example."
    );
  }

  if (!process.env.NODE_ENV) {
    console.warn(
      "Warning: NODE_ENV is not set. " +
        (isProd
          ? ""
          : "Set NODE_ENV=production for secure cookies + HTTPS enforcement when deploying.")
    );
  }

  if (process.env.NODE_ENV === "production") {
    const hmacDefault = "dev-only-otp-secret-change-me";
    const jwtDefault = "dev-only-jwt-secret-change-me";
    if (
      process.env.OTP_HASH_SECRET === hmacDefault ||
      process.env.JWT_SECRET === jwtDefault ||
      process.env.OTP_HASH_SECRET?.startsWith("change-this") ||
      process.env.JWT_SECRET?.startsWith("change-this")
    ) {
      console.warn(
        "Warning: OTP_HASH_SECRET / JWT_SECRET appear to be placeholder " +
          "values. Replace them with strong random strings for production."
      );
    }
  }
});

module.exports = app;
