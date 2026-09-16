const multer = require("multer");

/**
 * Map a Multer error to a safe HTTP response.
 */
function multerErrorResponse(error) {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return {
          status: 413,
          message: "File is too large. Maximum allowed size is 5 MB.",
        };
      case "LIMIT_FILE_COUNT":
        return {
          status: 400,
          message: "You can upload a maximum of 20 images at a time.",
        };
      case "LIMIT_UNEXPECTED_FILE":
        return {
          status: 400,
          message: "Unexpected file field name in the upload request.",
        };
      default:
        return { status: 400, message: "Invalid upload request." };
    }
  }
  return null;
}

/**
 * Centralized error handler.
 *
 * Converts known Multer and Cloudinary errors into safe, structured
 * JSON responses and hides internal details (stack traces, API secrets)
 * from the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const multerError = multerErrorResponse(error);
  if (multerError) {
    return res.status(multerError.status).json({
      success: false,
      message: multerError.message,
    });
  }

  // Errors raised by our own file filter / validation middleware
  if (error && error.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  // Cloudinary configuration / API errors
  if (error && error.http_code) {
    let message = "Cloudinary upload failed. Please try again.";
    if (error.http_code === 401 || error.http_code === 403) {
      message =
        "Cloudinary authentication failed. Please check your API credentials.";
    }
    return res.status(error.http_code >= 500 ? 502 : error.http_code).json({
      success: false,
      message,
    });
  }

  // Cloudinary SDK / configuration errors
  if (error && (error.message || "").includes("Cloudinary")) {
    return res.status(500).json({
      success: false,
      message: "Cloudinary service error. Please try again later.",
    });
  }

  // Catch-all: never leak stack traces or secrets
  console.error("Unhandled server error:", error);
  return res.status(500).json({
    success: false,
    message: "An unexpected server error occurred. Please try again.",
  });
}

module.exports = errorHandler;
