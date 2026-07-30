/**
 * FILE: components/sections/CreateReviewModal.jsx
 * ROLE: Visitor — public, rendered inside TestimonialsSection.jsx
 *
 * PURPOSE:
 * "Create Review" button + modal for guests to submit their own
 * review (name, 1-5 star rating, message, optional photo) from the
 * public Guest Reviews section. Follows the same floating-modal
 * pattern as WalkInChatWidget.jsx.
 *
 * DATA FLOW:
 * 1. Click "Create Review" -> isModalOpen = true
 * 2. useCreateReview().submitReview() POSTs multipart/form-data to
 *    /api/reviews (rate-limited, no auth)
 * 3. On success, modal switches to a thank-you state and auto-closes
 *    after a short delay. The submitted review is inserted with
 *    isApproved: false — it will NOT appear in the grid above until a
 *    super-admin approves it under Super-Admin > Testimonials.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateReview } from "@/hooks/useCreateReview";
import { sanitizeTextInput } from "@/utils/sanitizeInput";
import "./CreateReviewModal.css";

const QUOTE_MAX_LENGTH = 500;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB, matches the API's own limit

/**
 * StarRatingInput
 * Five clickable star buttons for choosing a 1-5 rating. Each is a
 * real <button> (not a <div onClick>) so it's reachable and operable
 * by keyboard, with a visible focus-visible ring (Rule 33.3).
 */
function StarRatingInput({ value, onChange }) {
  return (
    <div className="createReviewStarInput" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((starValue) => (
        <button
          key={starValue}
          type="button"
          role="radio"
          aria-checked={value === starValue}
          aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
          className={`createReviewStarButton ${starValue <= value ? "createReviewStarButton--filled" : ""}`}
          onClick={() => onChange(starValue)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function CreateReviewModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [rating, setRating] = useState(5);
  const [quote, setQuote] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const nameInputRef = useRef(null);

  const { submitReview, isSubmitting, submitError, isSubmitted, reset } = useCreateReview();

  // Autofocus the first field the moment the modal opens (Rule 34.3)
  useEffect(() => {
    if (isModalOpen && !isSubmitted) {
      nameInputRef.current?.focus();
    }
  }, [isModalOpen, isSubmitted]);

  // Auto-close a few seconds after a successful submission, so the
  // guest gets clear confirmation without having to click anything else
  useEffect(() => {
    if (!isSubmitted) return;
    const closeTimer = setTimeout(() => {
      handleClose();
    }, 3500);
    return () => clearTimeout(closeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitted]);

  function resetForm() {
    setGuestName("");
    setRating(5);
    setQuote("");
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoError(null);
    reset();
  }

  function handleOpen() {
    resetForm();
    setIsModalOpen(true);
  }

  function handleClose() {
    setIsModalOpen(false);
    resetForm();
  }

  /**
   * handlePhotoChange
   * Validates the chosen file client-side (type + size) before it's
   * ever sent — mirrors the same limits the API enforces server-side,
   * so the guest gets instant feedback instead of waiting for a 400.
   */
  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Please choose a JPEG, PNG, WebP, or GIF photo.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError("Photo is too large. Maximum size is 5MB.");
      return;
    }

    setPhotoError(null);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return; // Never allow double-submit
    await submitReview({ guestName, rating, quote, photoFile });
  }

  return (
    <>
      <button type="button" className="createReviewTriggerButton" onClick={handleOpen}>
        + Create Review
      </button>

      {isModalOpen && (
        <div className="createReviewBackdrop" role="presentation" onClick={handleClose}>
          <div
            className="createReviewModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="createReviewTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="createReviewCloseButton" onClick={handleClose} aria-label="Close">
              ×
            </button>

            {isSubmitted ? (
              // Success state — guest sees this immediately after a successful POST
              <div className="createReviewSuccess">
                <p className="createReviewSuccessTitle">Thanks, {guestName.split(" ")[0]}!</p>
                <p className="createReviewSuccessSubtitle">
                  Your review is pending approval and will appear here once our team reviews it.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <h2 id="createReviewTitle" className="createReviewTitle">Share your stay</h2>
                <p className="createReviewSubtitle">Tell other guests what you thought — it means a lot to us.</p>

                <label className="createReviewField" htmlFor="createReviewName">
                  Name <span aria-hidden="true">*</span>
                  <input
                    ref={nameInputRef}
                    id="createReviewName"
                    type="text"
                    value={guestName}
                    onChange={(event) => setGuestName(sanitizeTextInput(event.target.value))}
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>

                <div className="createReviewField">
                  <span>Rating <span aria-hidden="true">*</span></span>
                  <StarRatingInput value={rating} onChange={setRating} />
                </div>

                <label className="createReviewField" htmlFor="createReviewQuote">
                  Your review <span aria-hidden="true">*</span>
                  <textarea
                    id="createReviewQuote"
                    value={quote}
                    onChange={(event) => setQuote(sanitizeTextInput(event.target.value).slice(0, QUOTE_MAX_LENGTH))}
                    required
                    minLength={10}
                    maxLength={QUOTE_MAX_LENGTH}
                    rows={4}
                  />
                  {/* Live character counter (Rule 34.3) */}
                  <span className="createReviewCharCount">{quote.length} / {QUOTE_MAX_LENGTH}</span>
                </label>

                <label className="createReviewField" htmlFor="createReviewPhoto">
                  Photo <span className="createReviewOptionalLabel">(optional)</span>
                  <input
                    id="createReviewPhoto"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handlePhotoChange}
                  />
                </label>

                {photoPreviewUrl && (
                  <div className="createReviewPhotoPreviewRow">
                    {/* eslint-disable-next-line @next/next/no-img-element -- transient
                        blob: preview URL, not an R2 asset next/image can optimize */}
                    <img src={photoPreviewUrl} alt="Selected preview" className="createReviewPhotoPreview" />
                    <button type="button" className="createReviewRemovePhotoButton" onClick={handleRemovePhoto}>
                      Remove photo
                    </button>
                  </div>
                )}

                {/* Field-level error feedback, never alert() (Rule 34.3) */}
                {(photoError || submitError) && (
                  <p className="createReviewError" role="alert">{photoError || submitError}</p>
                )}

                <button type="submit" className="createReviewSubmitButton" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting…" : "Submit review"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
