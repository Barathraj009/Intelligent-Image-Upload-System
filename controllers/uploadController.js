const {
  uploadBufferToCloudinary,
} = require("../utils/cloudinaryUpload");
const { cloudinary, isConfigured } = require("../config/cloudinary");
const {
  validateImageFile,
  validateImageContent,
} = require("../middleware/uploadValidation");
const imageStore = require("../db/imageStore");

/**
 * Build a safe image metadata object returned to the client.
 * Deliberately omits internal/credential-related Cloudinary fields.
 */
function buildImageMeta(result, originalName) {
  return {
    originalName: originalName || result.original_filename || "unknown",
    url: result.secure_url,
    publicId: result.public_id,
    format: result.format,
    width: result.width || null,
    height: result.height || null,
    bytes: result.bytes || null,
  };
}

/**
 * Persist a successful upload in the SQLite image store so the gallery is
 * permanent, then return the meta enriched with its record id (used by the
 * frontend for immediate deletion without a refetch). A store failure must
 * not discard the user's successful Cloudinary upload.
 */
function recordImageAndEnrich(meta, req) {
  try {
    const record = imageStore.createImageRecord(req.auth.email, meta);
    return { ...meta, id: record.id };
  } catch (error) {
    console.warn("Failed to record image in gallery store:", error);
    return meta;
  }
}

/**
 * POST /api/upload/single
 * Upload a single image to Cloudinary.
 */
async function uploadSingle(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "Please select an image to upload." });
    }

    if (!isConfigured) {
      return res.status(500).json({
        success: false,
        message:
          "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in your .env file.",
      });
    }

    const validation = validateImageFile(file);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    // Authoritative content check: magic bytes + dimension cap.
    const contentCheck = validateImageContent(file);
    if (!contentCheck.valid) {
      return res.status(400).json({ success: false, message: contentCheck.message });
    }

    const result = await uploadBufferToCloudinary(file, cloudinary);

    return res.status(200).json({
      success: true,
      message: "Image uploaded successfully.",
      image: recordImageAndEnrich(buildImageMeta(result, file.originalname), req),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/upload/multiple
 * Upload multiple images to Cloudinary.
 *
 * Successful uploads and failures are tracked separately so that a
 * single failing image does not discard the successful uploads from
 * the same batch.
 */
async function uploadMultiple(req, res, next) {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one image to upload.",
      });
    }

    if (!isConfigured) {
      return res.status(500).json({
        success: false,
        message:
          "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in your .env file.",
      });
    }

    const uploadedImages = [];
    const failedUploads = [];

    for (const file of files) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        failedUploads.push({
          originalName: file.originalname,
          error: validation.message,
        });
        continue;
      }

      const contentCheck = validateImageContent(file);
      if (!contentCheck.valid) {
        failedUploads.push({
          originalName: file.originalname,
          error: contentCheck.message,
        });
        continue;
      }

      try {
        const result = await uploadBufferToCloudinary(file, cloudinary);
        uploadedImages.push(
          recordImageAndEnrich(buildImageMeta(result, file.originalname), req)
        );
      } catch (error) {
        failedUploads.push({
          originalName: file.originalname,
          error: "Upload failed. Please try again.",
        });
      }
    }

    if (uploadedImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All images failed to upload.",
        uploadedImages,
        failedUploads,
      });
    }

    const allSucceeded = failedUploads.length === 0;
    return res.status(200).json({
      success: true,
      message: allSucceeded
        ? "All images uploaded successfully."
        : "Some images uploaded successfully, but others failed.",
      uploadedImages,
      failedUploads,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { uploadSingle, uploadMultiple };
