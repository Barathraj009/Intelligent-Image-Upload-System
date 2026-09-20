"use strict";

const express = require("express");
const {
  listImages,
  deleteImage,
} = require("../controllers/imageController");

const router = express.Router();

/**
 * GET /api/images
 * List the authenticated user's images (newest first).
 */
router.get("/", listImages);

/**
 * DELETE /api/images/:id
 * Delete one of the authenticated user's images (records + Cloudinary asset).
 */
router.delete("/:id", deleteImage);

module.exports = router;