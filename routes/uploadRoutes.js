const express = require("express");

const {
  uploadSingleImage,
  uploadMultipleImages,
} = require("../middleware/uploadMiddleware");
const {
  uploadSingle,
  uploadMultiple,
} = require("../controllers/uploadController");

const router = express.Router();

/**
 * POST /api/upload/single
 * Upload a single image. Expects a multipart/form-data field named "image".
 */
router.post("/single", uploadSingleImage, uploadSingle);

/**
 * POST /api/upload/multiple
 * Upload multiple images. Expects a multipart/form-data field named "images".
 */
router.post("/multiple", uploadMultipleImages, uploadMultiple);

module.exports = router;
