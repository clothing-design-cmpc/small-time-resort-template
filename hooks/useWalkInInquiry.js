/**
 * FILE: hooks/useWalkInInquiry.js
 * ROLE: Visitor — used by the floating chat widget's form modal
 *
 * PURPOSE:
 * Owns the submit request for the walk-in inquiry form: POSTs to
 * /api/walkin-inquiry, tracks the in-flight/submitted state so the
 * modal can disable the button and show a confirmation, per Rule 34.3
 * (disabled submit during submission, success feedback).
 *
 * DATA FLOW:
 * 1. WalkInChatWidget.jsx calls submitInquiry({ guestName, guestPhone })
 *    on form submit
 * 2. POST /api/walkin-inquiry — public, rate-limited, no auth
 * 3. Returns { submitInquiry, isSubmitting, submitError, isSubmitted, reset }
 */
import { useCallback, useState } from "react";

export function useWalkInInquiry() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const submitInquiry = useCallback(async ({ guestName, guestPhone }) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/walkin-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName, guestPhone }),
      });
      const result = await response.json();

      if (!result.success) {
        setSubmitError(result.message || "We couldn't send that. Please try again.");
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

  // Resets everything so the widget starts fresh next time it's opened
  const reset = useCallback(() => {
    setIsSubmitting(false);
    setSubmitError(null);
    setIsSubmitted(false);
  }, []);

  return { submitInquiry, isSubmitting, submitError, isSubmitted, reset };
}
