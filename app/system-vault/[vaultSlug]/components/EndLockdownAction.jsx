/**
 * FILE: app/system-vault/[code]/components/EndLockdownAction.jsx
 * ROLE: Vault session holder (any role that can reach the vault link)
 *
 * PURPOSE:
 * Handles the "End Lockdown — Bring Website Back Online" action inside
 * System Recovery. Only super-admin role may actually end the lockdown.
 * If the current vault session lacks that role, instead of a dead-end
 * toast, this now offers a "Request Access" follow-up that notifies the
 * super-admin and logs the attempt.
 *
 * DATA FLOW:
 * 1. User clicks "End Lockdown"
 * 2. POST /api/vault/end-lockdown
 * 3. If 403 (insufficient role) -> show toast + reveal "Request Access"
 * 4. "Request Access" -> POST /api/vault/request-access -> emails super-admin,
 *    logs a SecurityLog row, disables itself once sent
 */
"use client";

import { useState } from "react";
import { showToast } from "@/app/shared/useToast";

export default function EndLockdownAction({ vaultCode }) {
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Attempts to end the lockdown; reveals the request-access fallback on 403
  async function handleEndLockdown() {
    setIsSubmitting(true);
    const response = await fetch("/api/vault/end-lockdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultCode }),
    });
    const result = await response.json();
    setIsSubmitting(false);

    if (response.status === 403) {
      setPermissionDenied(true);
      showToast("✕ You don't have permission to do this.", "error");
      return;
    }

    if (!result.success) {
      showToast("✕ " + result.message, "error");
      return;
    }

    showToast("✓ Lockdown ended. Website is back online.", "success");
  }

  // Notifies the super-admin that a lower-privilege session wants to end lockdown
  async function handleRequestAccess() {
    setIsSubmitting(true);
    const response = await fetch("/api/vault/request-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultCode }),
    });
    const result = await response.json();
    setIsSubmitting(false);

    if (result.success) {
      setRequestSent(true);
      showToast("✓ Super-admin notified. Awaiting their approval.", "success");
    } else {
      showToast("✕ " + result.message, "error");
    }
  }

  return (
    <div className="endLockdownAction">
      <button
        className="buttonSecondary"
        onClick={handleEndLockdown}
        disabled={isSubmitting || requestSent}
      >
        End Lockdown — Bring Website Back Online
      </button>

      {/* Fallback shown only after a 403 — replaces the previous dead end */}
      {permissionDenied && !requestSent && (
        <button
          className="buttonSecondary"
          onClick={handleRequestAccess}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Sending…" : "Request Access from Super-Admin"}
        </button>
      )}

      {requestSent && (
        <p className="endLockdownRequestSentNote">
          Request sent. The super-admin can approve from their dashboard.
        </p>
      )}
    </div>
  );
}