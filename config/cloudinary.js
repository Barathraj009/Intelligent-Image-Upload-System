// Load environment variables from .env file
require("dotenv").config();

const cloudinary = require("cloudinary").v2;

/**
 * Configure the Cloudinary SDK using environment variables.
 * Credentials are never hard-coded; they are read from the
 * process environment (typically loaded from the .env file).
 *
 * Two credential formats are supported:
 *   - A single CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME)
 *   - Individual CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 */
if (process.env.CLOUDINARY_URL) {
  // The SDK reads CLOUDINARY_URL automatically when config() has no arguments.
  cloudinary.config();
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Verify that all required Cloudinary configuration values are present.
 * Returns an array of the names of any missing settings.
 *
 * Placeholder values (e.g. the `your_api_key` sample from CLOUDINARY_URL or
 * a literal "your_*" individual setting) are treated as missing so the
 * health check doesn't report "configured" for a .env.example that was
 * copied verbatim.
 */
function getMissingConfig() {
  if (
    process.env.CLOUDINARY_URL &&
    !process.env.CLOUDINARY_URL.startsWith("cloudinary://your_")
  ) {
    return [];
  }

  const isPlaceholder = (value) => !value || value.startsWith("your_");

  const missing = [];
  if (isPlaceholder(process.env.CLOUDINARY_CLOUD_NAME)) {
    missing.push("CLOUDINARY_CLOUD_NAME");
  }
  if (isPlaceholder(process.env.CLOUDINARY_API_KEY)) {
    missing.push("CLOUDINARY_API_KEY");
  }
  if (isPlaceholder(process.env.CLOUDINARY_API_SECRET)) {
    missing.push("CLOUDINARY_API_SECRET");
  }
  return missing;
}

const isConfigured = getMissingConfig().length === 0;

module.exports = { cloudinary, isConfigured, getMissingConfig };
