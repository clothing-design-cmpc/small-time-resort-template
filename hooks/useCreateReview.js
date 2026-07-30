/**
 * FILE: hooks/useCreateReview.js
 * ROLE: Visitor — used by CreateReviewModal.jsx
 *
 * PURPOSE:
 * Owns the submit request for the visitor "Create Review" form: POSTs
 * multipart/form-data to /api/reviews, tracks the in-flight/submitted
 * state so the modal can disable the button and show a confirmation,
 * per Rule 34.3 (disabled submit during submission, success feedback).
 *
 * DATA FLOW:
 * 1. CreateReviewModal.jsx calls submitReview({ guestName, rating,
 *    quote, photoFile }) on form submit
 * 2. POST /api/reviews (multipart/form-data) — public, rate-limited,
 *    no auth. New rows are inserted with isApproved: false and never
 *    show up publicly until a super-admin approves them.
 * 3. Returns { submitReview, isSubmitting, submitError, isSubmitted, reset }
 */
import { useCallback, useState } from "react";

export function useCreateReview() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const submitReview = useCallback(async ({ guestName, rating, quote, photoFile }) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      formData.append("guestName", guestName);
      formData.append("rating", String(rating));
      formData.append("quote", quote);
      if (photoFile) {
        formData.append("photo", photoFile);
      }

      const response = await fetch("/api/reviews", {
        method: "POST",
        body: formData, // No Content-Type header — the browser sets the multipart boundary itself
      });
      const result = await response.json();

      if (!result.success) {
        setSubmitError(result.message || "We couldn't submit your review. Please try again.");
        return false;
      }

      setIsSubmitted(true);
      return true;
    } catch {
      setSubmitError("We couldn't reach the server. Check your connection and try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  // Resets everything so the modal starts fresh next time it's opened
  const reset = useCallback(() => {
    setIsSubmitting(false);
    setSubmitError(null);
    setIsSubmitted(false);
  }, []);

  return { submitReview, isSubmitting, submitError, isSubmitted, reset };
}
