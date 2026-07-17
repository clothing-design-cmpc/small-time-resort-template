/**
 * FILE: components/StepUpTotpModal.jsx
 * PURPOSE:
 * Reusable step-up re-verification modal. Used for the vault unban
 * action — a fresh TOTP code is required at the moment of the action,
 * separate from the vault session that granted dashboard access.
 * Never executes anything itself — calls onConfirm(totpCode) and lets
 * the parent make the actual API call and handle the result.
 */
"use client";

import { useState } from "react";
import "./stepUpTotpModal.css";

export default function StepUpTotpModal({ title, description, onConfirm, onCancel }) {
  const [totpCode, setTotpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * handleConfirm
   * Passes the entered code up to the parent, which makes the actual
   * unban API call. This component never talks to the API directly.
   */
  async function handleConfirm() {
    setIsSubmitting(true);
    await onConfirm(totpCode);
    setIsSubmitting(false);
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modalDialog">
        <h2>{title}</h2>
        <p>{description}</p>

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          placeholder="6-digit code"
          value={totpCode}
          onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))}
        />

        <div className="modalActions">
          <button onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || totpCode.length !== 6}
            className="buttonDestructive"
          >
            {isSubmitting ? "Verifying…" : "Confirm Unban"}
          </button>
        </div>
      </div>
    </div>
  );
}
