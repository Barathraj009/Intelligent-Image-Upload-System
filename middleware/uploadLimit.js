const rateLimit = require("express-rate-limit");

/**
 * Per-IP rate limit for the upload endpoints. Every batch request can carry
 * up to 20 images (100 MB in memory), so an unbounded number of requests
 * would let a single client exhaust server RAM or Cloudinary quota.
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "RATE_LIMITED",
      message:
        "Too many upload requests from your network. Please try again in a few minutes.",
    });
  },
});

/**
 * Global in-flight cap across ALL clients. Each upload is buffered fully in
 * memory before streaming to Cloudinary, so even with per-IP rate limiting
 * many parallel requests could each hold up to 100 MB of buffers. This
 * bounds total concurrent memory usage for the upload pipeline.
 */
function inFlightCap(maxConcurrent = 8) {
  let active = 0;

  return function inFlightLimit(req, res, next) {
    if (active >= maxConcurrent) {
      return res.status(503).json({
        success: false,
        error: "SERVER_BUSY",
        message:
          "The server is busy processing other uploads. Please try again shortly.",
      });
    }

    active += 1;
    res.on("finish", () => {
      active -= 1;
    });
    return next();
  };
}

module.exports = { uploadLimiter, inFlightCap };