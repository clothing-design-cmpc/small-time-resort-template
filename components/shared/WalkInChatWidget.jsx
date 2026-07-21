/**
 * FILE: components/shared/WalkInChatWidget.jsx
 * ROLE: Visitor — public, rendered on every visitor page via app/visitor/layout.jsx
 *
 * PURPOSE:
 * Floating "Chat with us" icon fixed to the bottom-right corner of the
 * screen. Clicking it opens a small modal with a 2-field form (name,
 * phone) — IP address is captured automatically server-side, never
 * asked from the guest. Built for walk-in/phone-in guests who want a
 * callback instead of using the full booking form (item #11/#12 audit
 * follow-up: the fastest path is a direct ask-to-be-called, not a
 * gated contact form).
 *
 * DATA FLOW:
 * 1. Click the floating button -> isModalOpen = true
 * 2. useWalkInInquiry().submitInquiry() POSTs to /api/walkin-inquiry
 * 3. On success, modal switches to a thank-you state and auto-closes
 *    after a short delay; the guest's IP was captured server-side from
 *    the request, not from anything sent by this component
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useWalkInInquiry } from "@/hooks/useWalkInInquiry";
import { sanitizeTextInput } from "@/utils/sanitizeInput";
import "./WalkInChatWidget.css";

export default function WalkInChatWidget() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const nameInputRef = useRef(null);

  const { submitInquiry, isSubmitting, submitError, isSubmitted, reset } = useWalkInInquiry();

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
      setIsModalOpen(false);
      setGuestName("");
      setGuestPhone("");
      reset();
    }, 3000);
    return () => clearTimeout(closeTimer);
  }, [isSubmitted, reset]);

  function handleOpen() {
    reset();
    setIsModalOpen(true);
  }

  function handleClose() {
    setIsModalOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return; // Never allow double-submit
    await submitInquiry({ guestName, guestPhone });
  }

  return (
    <>
      {/* Floating icon — always visible, bottom-right, min 44x44 tap target */}
      <button
        type="button"
        className="walkInChatButton"
        onClick={handleOpen}
        aria-label="Chat with us to request a callback"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>

      {isModalOpen && (
        <div className="walkInChatBackdrop" role="presentation" onClick={handleClose}>
          <div
            className="walkInChatModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walkInChatTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="walkInChatCloseButton" onClick={handleClose} aria-label="Close">
              ×
            </button>

            {isSubmitted ? (
              // Success state — guest sees this immediately after a successful POST
              <div className="walkInChatSuccess">
                <p className="walkInChatSuccessTitle">Thanks, {guestName.split(" ")[0]}!</p>
                <p className="walkInChatSuccessSubtitle">We'll call you back shortly at {guestPhone}.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <h2 id="walkInChatTitle" className="walkInChatTitle">Request a callback</h2>
                <p className="walkInChatSubtitle">
                  Leave your name and number — we'll call you to help set up your reservation.
                </p>

                <label className="walkInChatField" htmlFor="walkInChatName">
                  Name <span aria-hidden="true">*</span>
                  <input
                    ref={nameInputRef}
                    id="walkInChatName"
                    type="text"
                    value={guestName}
                    onChange={(event) => setGuestName(sanitizeTextInput(event.target.value))}
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>

                <label className="walkInChatField" htmlFor="walkInChatPhone">
                  Phone number <span aria-hidden="true">*</span>
                  <input
                    id="walkInChatPhone"
                    type="tel"
                    value={guestPhone}
                    onChange={(event) => setGuestPhone(sanitizeTextInput(event.target.value))}
                    required
                    minLength={7}
                    maxLength={30}
                    autoComplete="tel"
                  />
                </label>

                {/* Field-level error feedback, never alert() (Rule 34.3) */}
                {submitError && (
                  <p className="walkInChatError" role="alert">{submitError}</p>
                )}

                <button type="submit" className="walkInChatSubmitButton" disabled={isSubmitting}>
                  {isSubmitting ? "Sending…" : "Request callback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
