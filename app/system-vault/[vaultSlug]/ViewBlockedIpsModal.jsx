/**
 * FILE: app/system-vault/[vaultSlug]/ViewBlockedIpsModal.jsx
 * ROLE: Standalone — only ever rendered by RecoveryClient.jsx
 *
 * PURPOSE:
 * Step-up re-verification dialog for REVEALING Step 3's blocked-IP
 * list — a separate gate from UnbanIpModal, which re-verifies before
 * the actual unban. On open, automatically requests a brand-new code
 * via POST /api/admin/blocked-ips/request-unban-code (emailed to the
 * owner) — same endpoint UnbanIpModal already uses, since it isn't
 * tied to any specific IP. The owner reads it from their inbox and
 * types it in here. This component never fetches or shows the list
 * itself — it only collects the code and hands it to the parent's
 * onConfirm, which PATCHes /api/admin/blocked-ips/verify-view-code
 * and, only on success, reveals the list.
 *
 * Reuses the same shared .adminModalBackdrop / .adminModalDialog /
 * .adminModalActions classes (ConfirmationModal.css) and the
 * .unbanIpSendStatus / .unbanIpError / .unbanIpCodeInput classes
 * already defined in UnbanIpModal.css — this is the same modal
 * system with different copy, not a new one.
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import "@/components/superAdmin/ConfirmationModal.css";
import "./UnbanIpModal.css";

export default function ViewBlockedIpsModal({ onConfirm, onCancel }) {
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
   * generateAndSendVaultOtp(true)) — every reveal attempt gets its
   * own fresh code, never one left over from a previous action.
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
   * Passes the entered code up to the parent, which calls
   * verify-view-code and reveals the list on success — this
   * component has no knowledge of whether the list is showing.
   */
  async function handleConfirm() {
    setIsSubmitting(true);
    const result = await onConfirm(code);
    // Only clear the submitting state if the parent reports failure —
    // on success the parent closes this modal itself, so there's
    // nothing left here to reset.
    if (result?.failed) {
      setIsSubmitting(false);
      setAuthError(result.message);
    }
  }

  return (
    <div className="adminModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="viewBlockedIpsModalTitle">
      <div className="adminModalDialog">
        <h2 id="viewBlockedIpsModalTitle" className="adminModalTitle">
          Confirm It&apos;s You
        </h2>
        <p className="adminModalDescription">
          Enter the fresh verification code just emailed to you to view the list of blocked IPs.
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
            {isSubmitting ? "Verifying…" : "View Blocked IPs"}
          </button>
        </div>
      </div>
    </div>
  );
}
