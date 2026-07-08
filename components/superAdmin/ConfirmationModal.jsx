/**
 * FILE: components/superAdmin/ConfirmationModal.jsx
 * PURPOSE:
 * Shared modal for destructive/irreversible admin actions. Used first
 * by the Bookings page's "Cancel booking" action; reusable for future
 * admin pages (deleting a room, banning a user, etc.) so this dialog
 * never gets duplicated per feature.
 *
 * DATA FLOW:
 * 1. Parent renders this with isOpen + the specific title/description
 * 2. Confirm button calls the parent's onConfirm (async) and shows a
 *    "Processing..." state until it resolves — the modal never closes
 *    itself mid-action, the parent controls isOpen based on the result
 */
"use client";

import { useState } from "react";
import "./ConfirmationModal.css";

export default function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}) {
  const [isExecuting, setIsExecuting] = useState(false);

  async function handleConfirm() {
    setIsExecuting(true);
    await onConfirm();
    setIsExecuting(false);
  }

  if (!isOpen) return null;

  return (
    <div className="adminModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">
      <div className="adminModalDialog">
        <h2 id="adminModalTitle" className="adminModalTitle">{title}</h2>
        <p className="adminModalDescription">{description}</p>
        <div className="adminModalActions">
          <button type="button" className="adminModalButtonNeutral" onClick={onCancel} disabled={isExecuting}>
            Cancel
          </button>
          <button type="button" className="adminModalButtonDestructive" onClick={handleConfirm} disabled={isExecuting}>
            {isExecuting ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
