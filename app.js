// Load environment variables from the .env file (see .env.example)
require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const uploadRoutes = require("./routes/uploadRoutes");
const errorHandler = require("./middleware/errorHandler");
const { isConfigured, getMissingConfig } = require("./config/cloudinary");

// Gmail OTP auth module (reusable). Mounted at /api/auth.
const authModule = require("./modules/otp-auth");
const userStore = require("./db/userStore");

// Plug in this host's SQLite user store so a verified email creates/updates
// a real user record (the module never owns user accounts itself).
authModule.configure({
  userStore: {
    findOrCreateUser: userStore.findOrCreateUser,
  },
});

const app = express();
const PORT = process.env.PORT || 3000;

// Express configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Parse the httpOnly session cookie the OTP module sets on login.
app.use(cookieParser());

// Serve static assets from the public directory. `index: false` disables
// auto-serving `index.html` at "/" so the explicit / and /app routes below
// can pick which page to render (login vs. upload portal).
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  const missing = getMissingConfig();
  res.status(200).json({
    success: true,
    status: "ok",
    cloudinaryConfigured: isConfigured,
    cloudinaryMissingConfig: missing,
    uptime: process.uptime(),
  });
});

// Gmail OTP authentication API routes
app.use("/api/auth", authModule.routes);

// Upload API routes — protected: only verified users may upload images.
app.use("/api/upload", authModule.requireSession, uploadRoutes);

// Home route: the branded Gmail OTP login page is the landing route.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth", "index.html"));
});

// The upload portal (post-login application screen).
app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 404 handler for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// Centralized error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Intelligent Image Upload System running on http://localhost:${PORT}`);
  if (!isConfigured) {
    console.warn(
      "Warning: Cloudinary is not fully configured. " +
        `Missing: ${getMissingConfig().join(", ")}. ` +
        "See .env.example for the required environment variables."
    );
  }
});

module.exports = app;
