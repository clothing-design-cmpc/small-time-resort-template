/**
 * FILE: components/superAdmin/ConfirmationModal.jsx
 * ROLE: Super-admin — shared UI, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Reusable confirmation dialog for every destructive/irreversible admin
 * action (delete user, ban user, cancel order, reject product, etc.),
 * per the design system's Modals & Dialogs spec and Rule 34.4. One
 * shared instance — never duplicated per feature page.
 *
 * DATA FLOW:
 * 1. Consumer controls visibility via `isOpen` and supplies an
 *    `onConfirm` async callback that performs the actual destructive
 *    API call
 * 2. Confirm button shows a "Processing…" state and disables both
 *    buttons while onConfirm is in flight — the modal only calls
 *    onCancel to close; it never auto-closes on its own
 */
"use client";

import { useState } from "react";
import "./ConfirmationModal.css";

export default function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}) {
  // Tracks whether the destructive action is currently in flight, so the
  // buttons can disable and show a "Processing…" label — prevents a
  // second click from firing the action twice.
  const [isExecuting, setIsExecuting] = useState(false);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsExecuting(true);
    await onConfirm();
    setIsExecuting(false);
  }

  return (
    <div className="confirmationModalBackdrop">
      <div className="confirmationModalDialog" role="dialog" aria-modal="true" aria-labelledby="confirmationModalTitle">
        <button
          type="button"
          className="confirmationModalClose"
          aria-label="Close"
          onClick={onCancel}
          disabled={isExecuting}
        >
          ×
        </button>

        <h2 id="confirmationModalTitle" className="confirmationModalTitle">
          {title}
        </h2>
        <p className="confirmationModalDescription">{description}</p>

        <div className="confirmationModalActions">
          <button
            type="button"
            className="confirmationModalButton confirmationModalButton--neutral"
            onClick={onCancel}
            disabled={isExecuting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirmationModalButton confirmationModalButton--destructive"
            onClick={handleConfirm}
            disabled={isExecuting}
          >
            {isExecuting ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
