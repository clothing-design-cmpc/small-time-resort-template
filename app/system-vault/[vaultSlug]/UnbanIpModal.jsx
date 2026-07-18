/**
 * FILE: app/system-vault/[vaultSlug]/UnbanIpModal.jsx
 * ROLE: Standalone — only ever rendered by RecoveryClient.jsx
 *
 * PURPOSE:
 * Step-up re-verification dialog for unbanning a single IP. On open,
 * automatically requests a code via POST /api/admin/blocked-ips/
 * request-unban-code (emailed to the owner) — separate from, and
 * requested only after, the fresh code Step 3 already required just
 * to reveal the blocked-IP list. The owner reads it from their inbox
 * and types it in here. This component never deletes anything itself
 * — it only collects the code and hands { ipAddress, code } to the
 * parent's onConfirm, which calls PATCH /api/admin/blocked-ips/unban
 * and handles the result.
 *
 * Reuses the shared .adminModalBackdrop / .adminModalDialog /
 * .adminModalActions classes from components/superAdmin/
 * ConfirmationModal.css so this reads as the same modal system, just
 * with an added code field ConfirmationModal itself doesn't support.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { OTP_CODE_LENGTH } from "@/services/vaultOtpConfig";
import "@/components/superAdmin/ConfirmationModal.css";
import "./UnbanIpModal.css";

export default function UnbanIpModal({ ipAddress, onConfirm, onCancel }) {
  const [code, setCode] = useState("");
  const [sendStatus, setSendStatus] = useState({ state: "sending", message: "" });
  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guards against React 18/19 StrictMode's double-invoke of effects in
  // development, which would otherwise fire two send requests (and two
  // emails, each invalidating the other's code) for a single modal open.
  const hasSentOnce = useRef(false);

  /**
   * requestCode
   * @param {boolean} forceNew - false on the automatic mount-triggered
   *   call (reuse a still-valid code if one exists); true for any
   *   future explicit "Resend code" action.
   */
  async function requestCode(forceNew = true) {
    setSendStatus({ state: "sending", message: "" });
    setAuthError(null);
    try {
      const response = await axios.post("/api/admin/blocked-ips/request-unban-code", { forceNew });
      setSendStatus({ state: "sent", message: response.data.message });
    } catch (error) {
      setSendStatus({ state: "error", message: "" });
      setAuthError(error.response?.data?.message || "Failed to send the verification code.");
    }
  }

  // Fires once when the modal mounts — the owner shouldn't have to
  // click a separate button just to get the step-up code moving.
  useEffect(() => {
    if (hasSentOnce.current) return;
    hasSentOnce.current = true;
    // forceNew: false — if a valid code already exists (this effect
    // re-firing under StrictMode, or a Fast Refresh remount), reuse it
    // instead of silently invalidating whatever's already in the
    // owner's inbox and sending a second email.
    requestCode(false);
  }, []);

  /**
   * handleCodeChange
   * Trims the field's value BEFORE truncating it to OTP_CODE_LENGTH —
   * a paste from the email almost always drags in a leading/trailing
   * space or newline, and slicing the RAW value first would keep that
   * whitespace while cutting off the code's last real character.
   * Trimming first lets the full code survive the truncation intact —
   * same fix VaultOtpClient.jsx already applies to the login OTP field.
   *
   * IMPORTANT: the <input> below must NOT also carry a native
   * `maxLength` attribute. The browser enforces maxLength on the raw
   * pasted text BEFORE this onChange ever fires — so on a paste that
   * picks up one stray whitespace character, maxLength silently drops
   * the real last character of the code, and this trim() below only
   * ever sees the already-mutilated 11-character result. Doing the
   * trim + length clamp entirely in JS (on the untouched raw value) is
   * what actually fixes it — a maxLength attribute here would silently
   * reintroduce the exact bug this function is written to prevent.
   */
  function handleCodeChange(event) {
    const trimmedValue = event.target.value.trim();
    setCode(trimmedValue.length > OTP_CODE_LENGTH ? trimmedValue.slice(0, OTP_CODE_LENGTH) : trimmedValue);
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
          placeholder={`${OTP_CODE_LENGTH}-character code`}
          className="unbanIpCodeInput"
          value={code}
          onChange={handleCodeChange}
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
            disabled={isSubmitting || sendStatus.state !== "sent" || code.length !== OTP_CODE_LENGTH}
          >
            {isSubmitting ? "Verifying…" : "Confirm Unban"}
          </button>
        </div>
      </div>
    </div>
  );
}