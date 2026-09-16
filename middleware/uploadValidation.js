/**
 * Supported image MIME types and their corresponding file extensions.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** Maximum allowed size of a single image in bytes (5 MB). */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum number of images allowed in a bulk upload. */
const MAX_FILES_COUNT = 20;

/**
 * Extract a file extension from a filename.
 * Returns an empty string when the filename has no extension.
 */
function getFileExtension(filename = "") {
  const parts = String(filename).split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

/**
 * Validate a single uploaded file.
 * Returns an object describing the validation result.
 */
function validateImageFile(file) {
  if (!file) {
    return { valid: false, message: "No image was provided." };
  }

  const mimeType = (file.mimetype || "").toLowerCase();
  const extension = getFileExtension(file.originalname);

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      message:
        "Invalid file type. Only JPG, JPEG, PNG, WEBP and GIF images are allowed.",
    };
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      message:
        "Invalid file extension. Only .jpg, .jpeg, .png, .webp and .gif are allowed.",
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      message: "File is too large. Maximum allowed size is 5 MB.",
    };
  }

  return { valid: true };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_COUNT,
  validateImageFile,
};
