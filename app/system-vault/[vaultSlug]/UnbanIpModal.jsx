/**
 * FILE: app/system-vault/[vaultSlug]/UnbanIpModal.jsx
 * ROLE: Standalone — only ever rendered by RecoveryClient.jsx
 *
 * PURPOSE:
 * Step-up re-verification dialog for unbanning a single IP. On open,
 * automatically requests a brand-new code via
 * POST /api/admin/blocked-ips/request-unban-code (emailed to the
 * owner). The owner reads it from their inbox and types it in here.
 * This component never deletes anything itself — it only collects the
 * code and hands { ipAddress, code } to the parent's onConfirm, which
 * calls PATCH /api/admin/blocked-ips/unban and handles the result.
 *
 * Reuses the shared .adminModalBackdrop / .adminModalDialog /
 * .adminModalActions classes from components/superAdmin/
 * ConfirmationModal.css so this reads as the same modal system, just
 * with an added code field ConfirmationModal itself doesn't support.
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import "@/components/superAdmin/ConfirmationModal.css";
import "./UnbanIpModal.css";

export default function UnbanIpModal({ ipAddress, onConfirm, onCancel }) {
  const [code, setCode] = useState("");
  const [sendStatus, setSendStatus] = useState({ state: "sending", message: "" });
  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fires once when the modal mounts — the owner shouldn't have to
  // click a separate button just to get the step-up code moving.
  useEffect(() => {
    requestCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * requestCode
   * Always forces a brand-new code (the route itself always calls
   * generateAndSendVaultOtp(true)) — every unban attempt gets its own
   * fresh code, never a reused one from a previous action.
   */
  async function requestCode() {
    setSendStatus({ state: "sending", message: "" });
    setAuthError(null);
    try {
      const response = await axios.post("/api/admin/blocked-ips/request-unban-code");
      setSendStatus({ state: "sent", message: response.data.message });
    } catch (error) {
      setSendStatus({ state: "error", message: "" });
      setAuthError(error.response?.data?.message || "Failed to send the verification code.");
    }
  }

  /**
   * handleConfirm
   * Passes the entered code up to the parent, which makes the actual
   * unban API call and shows the resulting toast.
   */
  async function handleConfirm() {
    setIsSubmitting(true);
    await onConfirm(code);
    setIsSubmitting(false);
  }

  return (
    <div className="adminModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="unbanModalTitle">
      <div className="adminModalDialog">
        <h2 id="unbanModalTitle" className="adminModalTitle">
          Confirm Unban
        </h2>
        <p className="adminModalDescription">
          Enter the fresh verification code just emailed to you to unban <strong>{ipAddress}</strong>.
        </p>

        <p className="unbanIpSendStatus">
          {sendStatus.state === "sending" && "Sending a code to the vault owner's email…"}
          {sendStatus.state === "sent" && sendStatus.message}
        </p>

        {authError && (
          <p role="alert" className="unbanIpError">
            {authError}
          </p>
        )}

        <input
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          maxLength={12}
          placeholder="12-character code"
          className="unbanIpCodeInput"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={sendStatus.state !== "sent"}
        />

        <div className="adminModalActions">
          <button type="button" className="adminModalButtonNeutral" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            className="adminModalButtonDestructive"
            onClick={handleConfirm}
            disabled={isSubmitting || sendStatus.state !== "sent" || code.trim().length !== 12}
          >
            {isSubmitting ? "Verifying…" : "Confirm Unban"}
          </button>
        </div>
      </div>
    </div>
  );
}
