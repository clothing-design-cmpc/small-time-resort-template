/**
 * FILE: app/superAdmin/(protected)/content/gallery/GalleryUploadModal.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Upload modal for adding a new gallery image (blueprint Page 6).
 * Requires a category selection and an image file; caption is
 * optional. The image itself must be uploaded to R2 before this modal
 * can submit, since the gallery record always requires imageUrl/key.
 *
 * DATA FLOW:
 * 1. Admin picks a category, selects a file, and optionally types a
 *    caption
 * 2. On submit, the file is uploaded to /api/superAdmin/content/upload
 * 3. The resulting url/key plus category/caption are handed to the
 *    parent's uploadGalleryImage() callback — this modal never talks
 *    to the gallery API directly
 */
"use client";

import { useState } from "react";
import axios from "axios";
import Image from "next/image";
import "./Gallery.css";

const CATEGORIES = [
  { value: "bedroom", label: "Bedrooms" },
  { value: "bathroom", label: "Bathrooms" },
  { value: "common_area", label: "Common Areas" },
  { value: "outdoor", label: "Outdoor" },
  { value: "amenity", label: "Amenities" },
];

export default function GalleryUploadModal({ isOpen, defaultCategory, onSubmit, onCancel }) {
  const [category, setCategory] = useState(defaultCategory || "common_area");
  const [caption, setCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFormError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedFile) {
      setFormError("Please choose an image to upload.");
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", selectedFile);
      uploadFormData.append("folder", "gallery");

      const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);

      await onSubmit({
        category,
        caption: caption.trim() || null,
        imageUrl: uploadResponse.data.data.url,
        imageKey: uploadResponse.data.data.key,
        // EXIF "date taken", if the file had it — see utils/exifReader.js
        capturedAt: uploadResponse.data.data.capturedAt,
      });

      // Reset for the next upload — parent closes the modal on success.
      setSelectedFile(null);
      setPreviewUrl(null);
      setCaption("");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't upload this image. Please try again.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="galleryModalBackdrop" role="dialog" aria-modal="true">
      <div className="galleryModalDialog">
        <h2 className="galleryTitle">Upload Image</h2>

        <form onSubmit={handleSubmit} className="galleryUploadForm">
          <div className="galleryFormField">
            <label htmlFor="galleryUploadCategory">Category</label>
            <select id="galleryUploadCategory" value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="galleryFormField">
            <label htmlFor="galleryUploadFile">Image <span aria-hidden="true">*</span></label>
            <div className="galleryFormImageUpload">
              {previewUrl && (
                <div className="galleryFormImagePreviewWrapper">
                  {/* unoptimized for a freshly-selected local file — its blob: URL
                      is never a configured remote host for next/image to optimize */}
                  <Image src={previewUrl} alt="Upload preview" fill sizes="120px" style={{ objectFit: "cover" }} unoptimized />
                </div>
              )}
              <input id="galleryUploadFile" type="file" accept="image/*" autoFocus onChange={handleFileChange} />
            </div>
          </div>

          <div className="galleryFormField">
            <label htmlFor="galleryUploadCaption">Caption (optional)</label>
            <input id="galleryUploadCaption" type="text" value={caption} onChange={(event) => setCaption(event.target.value)} />
          </div>

          {formError && <span role="alert" className="galleryFormError">{formError}</span>}

          <div className="galleryFormActions">
            <button type="button" className="galleryFormButton galleryFormButton--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="galleryFormButton galleryFormButton--primary" disabled={isSubmitting}>
              {isSubmitting ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
