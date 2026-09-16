const multer = require("multer");

const {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_COUNT,
} = require("./uploadValidation");

/**
 * Multer is configured with memory storage so uploaded images are held
 * in a temporary in-memory buffer and are never written to permanent
 * files on the local server disk.
 */
const storage = multer.memoryStorage();

/**
 * Reject files whose MIME type is not an allowed image type.
 * Multer calls this before the buffer is kept, which is cheaper than
 * validating after the fact.
 */
function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error(
      "Invalid file type. Only JPG, JPEG, PNG, WEBP and GIF images are allowed."
    );
    error.status = 400;
    error.code = "INVALID_FILE_TYPE";
    cb(error);
  }
}

/**
 * Middleware that accepts a single image from the "image" form field.
 */
const uploadSingleImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
}).single("image");

/**
 * Middleware that accepts up to MAX_FILES_COUNT images from the
 * "images" form field.
 */
const uploadMultipleImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_COUNT,
  },
}).array("images", MAX_FILES_COUNT);

module.exports = { uploadSingleImage, uploadMultipleImages };
