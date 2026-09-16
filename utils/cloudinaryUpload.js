/**
 * Upload an in-memory file buffer to Cloudinary.
 *
 * Multer's memoryStorage keeps the image in `file.buffer`, so we stream
 * that buffer straight to Cloudinary. No temporary file is ever written
 * to disk.
 *
 * @param {Object} file - A Multer file object (has .buffer, .mimetype, .originalname).
 * @param {Object} cloudinary - The configured Cloudinary v2 SDK instance.
 * @returns {Promise<Object>} Resolves with the Cloudinary upload result.
 */
function uploadBufferToCloudinary(file, cloudinary) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "college-project-images",
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    uploadStream.end(file.buffer);
  });
}

module.exports = { uploadBufferToCloudinary };
