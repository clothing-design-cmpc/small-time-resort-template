/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/BookingConfirmationEmailImageModal.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Upload modal for adding a new image to the booking confirmation
 * email. An optional caption may be attached. The image itself must
 * be uploaded to R2 before this modal can submit, since the image
 * record always requires imageUrl/key — same pattern as
 * GalleryUploadModal.
 *
 * DATA FLOW:
 * 1. Admin selects a file and optionally types a caption
 * 2. On submit, the file is uploaded to /api/superAdmin/content/upload
 *    (folder "booking-confirmation-email")
 * 3. The resulting url/key plus caption are handed to the parent's
 *    addEmailImage() callback — this modal never talks to the
 *    booking-confirmation-email images API directly
 */
"use client";

import { useState } from "react";
import axios from "axios";
import Image from "next/image";
import "./BookingConfirmationEmail.css";

export default function BookingConfirmationEmailImageModal({ isOpen, onSubmit, onCancel }) {
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
      uploadFormData.append("folder", "booking-confirmation-email");

      const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);

      await onSubmit({
        caption: caption.trim() || null,
        imageUrl: uploadResponse.data.data.url,
        imageKey: uploadResponse.data.data.key,
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
    <div className="bceModalBackdrop" role="dialog" aria-modal="true">
      <div className="bceModalDialog">
        <h2 className="bceTitle">Add Image</h2>

        <form onSubmit={handleSubmit} className="bceUploadForm">
          <div className="bceFormField">
            <label htmlFor="bceUploadFile">
              Image <span aria-hidden="true">*</span>
            </label>
            <div className="bceFormImageUpload">
              {previewUrl && (
                <div className="bceFormImagePreviewWrapper">
                  {/* unoptimized for a freshly-selected local file — its blob: URL
                      is never a configured remote host for next/image to optimize */}
                  <Image src={previewUrl} alt="Upload preview" fill sizes="120px" style={{ objectFit: "cover" }} unoptimized />
                </div>
              )}
              <input id="bceUploadFile" type="file" accept="image/*" autoFocus onChange={handleFileChange} />
            </div>
          </div>

          <div className="bceFormField">
            <label htmlFor="bceUploadCaption">Caption (optional)</label>
            <input id="bceUploadCaption" type="text" value={caption} onChange={(event) => setCaption(event.target.value)} />
          </div>

          {formError && (
            <span role="alert" className="bceFormError">
              {formError}
            </span>
          )}

          <div className="bceFormActions">
            <button type="button" className="bceFormButton bceFormButton--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="bceFormButton bceFormButton--primary" disabled={isSubmitting}>
              {isSubmitting ? "Uploading…" : "Add Image"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
