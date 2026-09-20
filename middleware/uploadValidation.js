const { imageSize } = require("image-size");

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

/** The image-size package's type strings for the same formats. */
const ALLOWED_DETECTED_TYPES = new Set(["jpg", "png", "webp", "gif"]);

/** Maximum allowed size of a single image in bytes (5 MB). */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum number of images allowed in a bulk upload. */
const MAX_FILES_COUNT = 20;

/** Largest allowed dimension (width or height) in pixels — prevents decompression/pixel bombs. */
const MAX_IMAGE_DIMENSION = 8000;

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

/**
 * Validate the actual byte contents of an uploaded image — not just the
 * client-supplied MIME/extension headers, which are trivially spoofable.
 *
 * Uses the `image-size` package to read the file's real magic bytes and
 * dimensions. This catches renamed non-images (e.g. an exe renamed to
 * .jpg), polyglots, and decompression bombs (tiny files that decode to
 * huge pixel dimensions).
 *
 * Returns { valid: true } or { valid: false, message }.
 */
function validateImageContent(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    return { valid: false, message: "The uploaded file appears to be empty." };
  }

  let dimensions;
  try {
    dimensions = imageSize(file.buffer);
  } catch (error) {
    return {
      valid: false,
      message:
        "The file is not a valid image. Its contents don't match JPG, PNG, WEBP or GIF.",
    };
  }

  if (!dimensions || !ALLOWED_DETECTED_TYPES.has(dimensions.type)) {
    return {
      valid: false,
      message:
        "The file is not a valid image. Its contents don't match JPG, PNG, WEBP or GIF.",
    };
  }

  const width = dimensions.width;
  const height = dimensions.height;

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    return {
      valid: false,
      message: "The image has invalid or missing dimensions.",
    };
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      valid: false,
      message: `Image dimensions are too large. Maximum is ${MAX_IMAGE_DIMENSION} x ${MAX_IMAGE_DIMENSION} pixels.`,
    };
  }

  return { valid: true, dimensions };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_COUNT,
  MAX_IMAGE_DIMENSION,
  validateImageFile,
  validateImageContent,
};
