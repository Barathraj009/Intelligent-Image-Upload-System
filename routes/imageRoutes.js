const express = require("express");

const { cloudinary, isConfigured } = require("../config/cloudinary");
const {
  listImages,
  deleteImageRecord,
} = require("../db/imageStore");

const router = express.Router();

/**
 * GET /api/images
 * List every image the authenticated user has uploaded — the persisted,
 * session-independent "central gallery" for their project.
 */
router.get("/", (req, res) => {
  const images = listImages(req.auth.email);
  res.status(200).json({
    success: true,
    images,
  });
});

/**
 * DELETE /api/images/:id
 * Remove an image the authenticated user owns: deletes the Cloudinary asset
 * and the SQLite metadata row. Returns 404 if the image isn't found or
 * belongs to a different user.
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid image id." });
    }

    const { deleted, publicId } = deleteImageRecord(id, req.auth.email);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found." });
    }

    // Delete from Cloudinary. Best-effort: if deletion fails (e.g. asset
    // already gone), the local row is still removed so the gallery reflects
    // what's actually usable.
    try {
      if (isConfigured) await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      // Cloudinary deletion failed — surface a warning but don't fail the
      // whole request; the local row is already gone.
      console.error("Cloudinary destroy failed:", error.message);
    }

    return res.status(200).json({
      success: true,
      message: "Image deleted.",
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;