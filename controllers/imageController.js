"use strict";

const { cloudinary } = require("../config/cloudinary");
const imageStore = require("../db/imageStore");

/**
 * Map a DB row (snake_case) to the public JSON shape the API returns.
 * Deliberately omits internal/credential-related fields.
 */
function serializeImage(row) {
  return {
    id: row.id,
    publicId: row.public_id,
    url: row.url,
    originalName: row.original_name,
    format: row.format,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/images
 * List every image the authenticated user has uploaded, newest first.
 */
async function listImages(req, res, next) {
  try {
    const images = imageStore.listImages(req.auth.email).map(serializeImage);
    return res.status(200).json({ success: true, count: images.length, images });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /api/images/:id
 * Remove the authenticated user's image row AND its Cloudinary asset.
 * The user can only ever delete their own records (ownership enforced by
 * the email scoping inside imageStore).
 */
async function deleteImage(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid image id." });
    }

    const email = req.auth.email;
    const record = imageStore.findImage(id, email);
    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found." });
    }

    try {
      // The admin API resolves even when the asset no longer exists, so any
      // resolution means the Cloudinary side is settled.
      await cloudinary.api.delete_resources(
        [record.public_id],
        { resource_type: "image" }
      );
    } catch (error) {
      return res.status(502).json({
        success: false,
        message:
          "Failed to remove the image from Cloudinary. Please try again.",
      });
    }

    imageStore.deleteImageRecord(id, email);

    return res
      .status(200)
      .json({ success: true, message: "Image deleted successfully.", id });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listImages, deleteImage };