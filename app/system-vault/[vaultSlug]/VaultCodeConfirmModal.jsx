/**
 * FILE: app/system-vault/[vaultSlug]/VaultCodeConfirmModal.jsx
 * ROLE: Standalone — rendered by VaultDangerZoneSection.jsx only
 *
 * PURPOSE:
 * Generalized version of UnbanIpModal.jsx's step-up flow, reused for
 * the Danger Zone actions ("Schedule wipe" and "Truncate Now") and for
 * Step 3's "View Blocked IPs" gate. On open, requests a code from
 * requestCodeEndpoint (emailed to the vault owner) — never forcing a
 * brand-new one if a still-valid one already exists (see requestCode's
 * forceNew doc below), which is what keeps a StrictMode dev double-
 * mount from sending two separate codes/emails for one modal open.
 * The owner types the code in here; this component never performs the
 * gated action itself — it only collects the code and hands it to the
 * parent's onConfirm(code), which makes the actual API call.
 *
 * Reuses the shared .adminModalBackdrop / .adminModalDialog /
 * .adminModalActions classes from ConfirmationModal.css so this reads
 * as the same modal system project-wide.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { OTP_CODE_LENGTH } from "@/services/vaultOtpConfig";
import "@/components/superAdmin/ConfirmationModal.css";
import "./VaultCodeConfirmModal.css";

export default function VaultCodeConfirmModal({
  title,
  description,
  confirmLabel,
  requestCodeEndpoint,
  onConfirm,
  onCancel,
}) {
  const [code, setCode] = useState("");
  const [sendStatus, setSendStatus] = useState({ state: "sending", message: "" });
  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guards against React 18/19 StrictMode's double-invoke of effects in
  // development, which would otherwise fire two send requests (and two
  // emails, each invalidating the other's code) for a single modal open.
  const hasSentOnce = useRef(false);

  // Fires once on mount — the owner shouldn't need a separate click
  // just to get the step-up code moving.
  useEffect(() => {
    if (hasSentOnce.current) return;
    hasSentOnce.current = true;
    requestCode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * requestCode
   * @param {boolean} forceNew - false on the automatic mount-triggered
   *   call (reuse a still-valid code if one exists, so a StrictMode
   *   re-fire or Fast Refresh remount can't trigger a second email);
   *   true for any future explicit "Resend code" action.
   */
  async function requestCode(forceNew = true) {
    setSendStatus({ state: "sending", message: "" });
    setAuthError(null);
    try {
      const response = await axios.post(requestCodeEndpoint, { forceNew });
      setSendStatus({ state: "sent", message: response.data.message });
    } catch (error) {
      setSendStatus({ state: "error", message: "" });
      setAuthError(error.response?.data?.message || "Failed to send the verification code.");
    }
  }

  /**
   * handleCodeChange
   * Trims the field's value BEFORE truncating it to OTP_CODE_LENGTH —
   * a paste from the email almost always drags in a leading/trailing
   * space or newline, and slicing the RAW value first would keep that
   * whitespace while cutting off the code's last real character.
   * Same fix VaultOtpClient.jsx already applies to the login OTP field.
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

  async function handleConfirm() {
    setIsSubmitting(true);
    await onConfirm(code);
    setIsSubmitting(false);
  }

  return (
    <div className="adminModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="vaultCodeConfirmTitle">
      <div className="adminModalDialog">
        <h2 id="vaultCodeConfirmTitle" className="adminModalTitle">
          {title}
        </h2>
        <p className="adminModalDescription">{description}</p>

        <p className="vaultCodeSendStatus">
          {sendStatus.state === "sending" && "Sending a code to the vault owner's email…"}
          {sendStatus.state === "sent" && sendStatus.message}
        </p>

        {authError && (
          <p role="alert" className="vaultCodeError">
            {authError}
          </p>
        )}

        <input
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          placeholder={`${OTP_CODE_LENGTH}-character code`}
          className="vaultCodeInput"
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
            {isSubmitting ? "Verifying…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
