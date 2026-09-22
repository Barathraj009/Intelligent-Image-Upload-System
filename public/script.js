"use strict";

/**
 * Intelligent Image Upload System - frontend logic.
 * Handles client-side validation, drag & drop, uploads via fetch,
 * dynamic gallery rendering and error reporting.
 */

/* ------------------------------------------------------------------
   Constants
------------------------------------------------------------------ */

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB in bytes
const MAX_FILES = 20;

const API = {
  single: "/api/upload/single",
  multiple: "/api/upload/multiple",
  health: "/api/health",
  images: "/api/images",
  logout: "/api/auth/logout",
};

/* ------------------------------------------------------------------
   DOM references
------------------------------------------------------------------ */

const dom = {
  statusBanner: document.getElementById("systemStatus"),

  single: {
    dropZone: document.getElementById("singleDropZone"),
    input: document.getElementById("singleFileInput"),
    fileName: document.getElementById("singleFileName"),
    button: document.getElementById("singleUploadBtn"),
    feedback: document.getElementById("singleFeedback"),
  },

  bulk: {
    dropZone: document.getElementById("bulkDropZone"),
    input: document.getElementById("bulkFileInput"),
    fileName: document.getElementById("bulkFileName"),
    button: document.getElementById("bulkUploadBtn"),
    feedback: document.getElementById("bulkFeedback"),
  },

  gallery: document.getElementById("gallery"),
  emptyState: document.getElementById("emptyState"),
  galleryCount: document.getElementById("galleryCount"),
  logoutBtn: document.getElementById("logoutBtn"),

  lightbox: document.getElementById("lightbox"),
};

/* ------------------------------------------------------------------
   State
------------------------------------------------------------------ */

let singleSelectedFile = null;
let bulkSelectedFiles = [];

/* ------------------------------------------------------------------
   Helpers
------------------------------------------------------------------ */

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function setFeedback(element, type, message) {
  element.className = "feedback " + type;
  element.textContent = message;
  element.classList.add("show");
}

function clearFeedback(element) {
  element.className = "feedback";
  element.textContent = "";
  element.classList.remove("show");
}

function showStatus(type, message) {
  dom.statusBanner.className = "status-banner " + type;
  dom.statusBanner.textContent = message;
  dom.statusBanner.classList.remove("hidden");
}

function hideStatus() {
  dom.statusBanner.classList.add("hidden");
}

/* ------------------------------------------------------------------
   Validation
------------------------------------------------------------------ */

function validateSingleFile(file) {
  if (!file) return { valid: false, message: "Please select an image to upload." };
  return validateFile(file);
}

function validateFile(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      valid: false,
      message:
        "Invalid file type. Only JPG, JPEG, PNG, WEBP and GIF images are allowed.",
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: "File size exceeds the 5 MB limit.",
    };
  }
  return { valid: true };
}

function validateBulkFiles(files) {
  if (!files.length) {
    return { valid: false, message: "Please select at least one image to upload." };
  }
  if (files.length > MAX_FILES) {
    return {
      valid: false,
      message: "You can upload a maximum of 20 images.",
    };
  }
  for (const file of files) {
    const result = validateFile(file);
    if (!result.valid) {
      return { valid: false, message: result.message + " (" + file.name + ")" };
    }
  }
  return { valid: true };
}

/* ------------------------------------------------------------------
   Drop zone setup
------------------------------------------------------------------ */

function setupDropZone(dropZone, input, onFiles) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) onFiles(files);
  });

  dropZone.addEventListener("click", () => input.click());

  // Prevent the input's own click from bubbling back to the drop zone,
  // which would otherwise trigger the file picker a second time.
  input.addEventListener("click", (event) => event.stopPropagation());

  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });

  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    if (files.length) onFiles(files);
  });
}

/* ------------------------------------------------------------------
   File selection handlers
------------------------------------------------------------------ */

function handleSingleSelect(file) {
  const result = validateFile(file);
  if (!result.valid) {
    singleSelectedFile = null;
    dom.single.fileName.textContent = "No file selected";
    dom.single.button.disabled = true;
    setFeedback(dom.single.feedback, "error", result.message);
    return;
  }
  singleSelectedFile = file;
  dom.single.fileName.textContent = file.name + " (" + formatBytes(file.size) + ")";
  dom.single.button.disabled = false;
  clearFeedback(dom.single.feedback);
}

function handleBulkSelect(files) {
  bulkSelectedFiles = files.slice(0, MAX_FILES);
  const truncated = files.length > MAX_FILES;

  dom.bulk.fileName.textContent =
    bulkSelectedFiles.length === 1
      ? bulkSelectedFiles[0].name
      : bulkSelectedFiles.length + " files selected";

  const result = validateBulkFiles(bulkSelectedFiles);
  if (!result.valid) {
    dom.bulk.button.disabled = true;
    setFeedback(dom.bulk.feedback, "error", result.message);
    return;
  }

  dom.bulk.button.disabled = false;
  clearFeedback(dom.bulk.feedback);
  if (truncated) {
    setFeedback(
      dom.bulk.feedback,
      "info",
      "Only the first 20 images will be uploaded."
    );
  }
}

/* ------------------------------------------------------------------
   Upload logic
------------------------------------------------------------------ */

async function fetchWithTimeout(url, options, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, credentials: "include", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (err) {
    data = { success: false, message: "The server returned an invalid response." };
  }
  if (!response.ok && !data.message) {
    data.message = "Request failed with status " + response.status + ".";
  }
  return data;
}

async function uploadSingle() {
  if (!singleSelectedFile) return;

  const result = validateSingleFile(singleSelectedFile);
  if (!result.valid) {
    setFeedback(dom.single.feedback, "error", result.message);
    return;
  }

  const formData = new FormData();
  formData.append("image", singleSelectedFile);

  setFeedback(dom.single.feedback, "loading", "Uploading...");
  dom.single.button.disabled = true;

  try {
    const response = await fetchWithTimeout(API.single, {
      method: "POST",
      body: formData,
    });
    const data = await parseResponse(response);

    if (response.ok && data.success) {
      setFeedback(
        dom.single.feedback,
        "success",
        "Upload successful: " + data.image.originalName
      );
      addImageToGallery(data.image);
      singleSelectedFile = null;
      dom.single.input.value = "";
      dom.single.fileName.textContent = "No file selected";
    } else {
      setFeedback(
        dom.single.feedback,
        "error",
        data.message || "Upload failed."
      );
    }
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "Upload timed out. Please try again."
        : "Network error. Please check your connection and try again.";
    setFeedback(dom.single.feedback, "error", message);
  } finally {
    dom.single.button.disabled = !singleSelectedFile;
  }
}

async function uploadBulk() {
  if (!bulkSelectedFiles.length) return;

  const result = validateBulkFiles(bulkSelectedFiles);
  if (!result.valid) {
    setFeedback(dom.bulk.feedback, "error", result.message);
    return;
  }

  const formData = new FormData();
  bulkSelectedFiles.forEach((file) => formData.append("images", file));

  setFeedback(
    dom.bulk.feedback,
    "loading",
    "Uploading " + bulkSelectedFiles.length + " image(s)..."
  );
  dom.bulk.button.disabled = true;

  try {
    const response = await fetchWithTimeout(API.multiple, {
      method: "POST",
      body: formData,
    });
    const data = await parseResponse(response);

    if (response.ok && data.success) {
      data.uploadedImages.forEach(addImageToGallery);

      if (data.failedUploads && data.failedUploads.length > 0) {
        setFeedback(
          dom.bulk.feedback,
          "error",
          data.uploadedImages.length +
            " uploaded, " +
            data.failedUploads.length +
            " failed."
        );
      } else {
        setFeedback(
          dom.bulk.feedback,
          "success",
          "Upload successful: " + data.uploadedImages.length + " image(s)."
        );
      }
    } else {
      setFeedback(
        dom.bulk.feedback,
        "error",
        data.message || "Upload failed."
      );
    }
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "Upload timed out. Please try again."
        : "Network error. Please check your connection and try again.";
    setFeedback(dom.bulk.feedback, "error", message);
  } finally {
    dom.bulk.button.disabled = false;
  }
}

/* ------------------------------------------------------------------
   Gallery rendering (safe DOM construction)
------------------------------------------------------------------ */

function createImageCard(image) {
  const card = document.createElement("article");
  card.className = "gallery-card";

  const img = document.createElement("img");
  img.className = "gallery-thumb";
  img.src = image.url;
  img.alt = "Uploaded project image: " + (image.originalName || "unknown");
  img.loading = "lazy";
  img.addEventListener("click", () => openLightbox(image.url));

  const body = document.createElement("div");
  body.className = "gallery-body";

  const name = document.createElement("p");
  name.className = "name";
  name.textContent = image.originalName || "Untitled image";

  const meta = document.createElement("div");
  meta.className = "meta";

  const metaValues = [];
  if (image.format) metaValues.push(image.format.toUpperCase());
  if (image.width && image.height) {
    metaValues.push(image.width + "x" + image.height);
  }
  if (image.bytes) metaValues.push(formatBytes(image.bytes));

  metaValues.forEach((value) => {
    const span = document.createElement("span");
    span.textContent = value;
    meta.appendChild(span);
  });

  const link = document.createElement("a");
  link.className = "gallery-link";
  link.href = image.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = image.url;

  const actions = document.createElement("div");
  actions.className = "gallery-actions";

  if (image.id != null) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "gallery-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute(
      "aria-label",
      "Delete image " + (image.originalName || "")
    );
    deleteBtn.addEventListener("click", () => handleDeleteImage(image.id, card));
    actions.appendChild(deleteBtn);
  }

  body.appendChild(name);
  if (metaValues.length) body.appendChild(meta);
  body.appendChild(link);
  body.appendChild(actions);

  card.appendChild(img);
  card.appendChild(body);

  return card;
}

function updateGalleryState() {
  const count = dom.gallery.children.length;
  dom.galleryCount.textContent = count === 1 ? "1 image" : count + " images";
  if (dom.emptyState) {
    dom.emptyState.style.display = count === 0 ? "" : "none";
  }
}

function addImageToGallery(image) {
  if (!image || !image.url) return;

  const card = createImageCard(image);
  dom.gallery.appendChild(card);
  updateGalleryState();
}

async function handleDeleteImage(id, card) {
  if (!window.confirm("Delete this image from the gallery?")) return;

  try {
    const response = await fetchWithTimeout(API.images + "/" + id, {
      method: "DELETE",
    });
    const data = await parseResponse(response);

    if (response.ok && data.success) {
      card.remove();
      updateGalleryState();
      showStatus("success", "Image deleted successfully.");
      setTimeout(hideStatus, 2500);
    } else {
      showStatus("error", data.message || "Could not delete the image.");
      setTimeout(hideStatus, 4000);
    }
  } catch (error) {
    showStatus(
      "error",
      "Network error. Could not delete the image. Please try again."
    );
    setTimeout(hideStatus, 4000);
  }
}

/* ------------------------------------------------------------------
   Persistent gallery loading
------------------------------------------------------------------ */

async function loadImages() {
  try {
    const response = await fetchWithTimeout(API.images, { method: "GET" });
    const data = await parseResponse(response);

    if (!response.ok) {
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      return;
    }

    if (data.success) {
      (data.images || []).forEach(addImageToGallery);
    }
  } catch (error) {
    // Non-fatal: the gallery still fills with images uploaded this session.
  }
}

/* ------------------------------------------------------------------
   Lightbox
------------------------------------------------------------------ */

function openLightbox(url) {
  if (!dom.lightbox) {
    dom.lightbox = document.createElement("div");
    dom.lightbox.className = "lightbox";
    document.body.appendChild(dom.lightbox);

    const close = document.createElement("button");
    close.className = "lightbox-close";
    close.setAttribute("aria-label", "Close image preview");
    close.textContent = "\u00d7";
    close.addEventListener("click", closeLightbox);

    dom.lightbox.appendChild(close);
    dom.lightbox.addEventListener("click", (event) => {
      if (event.target === dom.lightbox) closeLightbox();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeLightbox();
    });
  }

  const img = document.createElement("img");
  img.src = url;
  img.alt = "Full size preview";
  dom.lightbox.appendChild(img);
  dom.lightbox.classList.add("open");
}

function closeLightbox() {
  if (!dom.lightbox) return;
  const img = dom.lightbox.querySelector("img");
  if (img) img.remove();
  dom.lightbox.classList.remove("open");
}

/* ------------------------------------------------------------------
   Health check
------------------------------------------------------------------ */

async function checkSystemStatus() {
  try {
    const response = await fetch(API.health);
    const data = await response.json();

    if (data.cloudinaryConfigured === false) {
      showStatus(
        "warning",
        "Cloudinary is not configured yet. Uploads will be unavailable until " +
          "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET " +
          "are set in the .env file."
      );
    }
  } catch (error) {
    // The API is unreachable; the server is likely offline.
    showStatus("error", "Cannot reach the server. Please ensure it is running.");
  }
}

/* ------------------------------------------------------------------
   Init
------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Session gate
------------------------------------------------------------------ */

async function requireSession() {
  try {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    if (response.ok) return;
  } catch (error) {
    // Server unreachable: fall through and let the upload attempts report it.
    return;
  }

  // No valid session — send the user back to the login page.
  window.location.replace("/");
}

async function logout() {
  try {
    await fetchWithTimeout(API.logout, { method: "POST" });
  } catch (error) {
    // Ignore network errors during logout; proceed to the login page anyway.
  }
  window.location.replace("/");
}

function init() {
  requireSession();
  loadImages();

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener("click", logout);
  }

  setupDropZone(dom.single.dropZone, dom.single.input, (files) => {
    handleSingleSelect(files[0]);
  });

  setupDropZone(dom.bulk.dropZone, dom.bulk.input, (files) => {
    handleBulkSelect(files);
  });

  dom.single.button.addEventListener("click", uploadSingle);
  dom.bulk.button.addEventListener("click", uploadBulk);

  checkSystemStatus();
}

document.addEventListener("DOMContentLoaded", init);
