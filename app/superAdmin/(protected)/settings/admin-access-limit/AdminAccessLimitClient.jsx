/**
 * FILE: app/superAdmin/(protected)/settings/admin-access-limit/AdminAccessLimitClient.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Lets the super-admin cap how many devices/browsers can be logged in
 * to /superAdmin at the same time. One input field + two buttons:
 *   - "Edit" enables the input so a new number can be typed
 *   - "Save" sends the new value to the database, then disables the
 *     input again — the field is read-only outside of an active edit
 * Once saved, app/api/auth/login/route.js enforces this limit on every
 * login attempt, and the public login page (Task: login-side inputs
 * disable once the limit is full) reads it via /api/auth/access-status.
 *
 * DATA FLOW:
 * 1. useAdminAccessLimit() fetches the current limit + how many
 *    admins are signed in right now, on mount
 * 2. "Edit" flips isEditing true, enabling the input
 * 3. "Save" validates the typed value, calls saveLimit(), shows a
 *    toast, and flips isEditing back to false (input disabled again)
 */
"use client";

import { useEffect, useState } from "react";
import { useAdminAccessLimit } from "@/hooks/useAdminAccessLimit";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";

export default function AdminAccessLimitClient() {
  const { maxAdminSessions, activeSessionCount, isLoading, error, saveLimit } = useAdminAccessLimit();
  const { toasts, showToast, dismissToast } = useToast();

  // Field starts disabled (view-only) — only an explicit "Edit" click
  // enables it, per the Save/Edit toggle this page was built around.
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftValue, setDraftValue] = useState("");

  // Keep the draft in sync with the loaded value, but never while the
  // admin is actively mid-edit — that would clobber what they're typing.
  useEffect(() => {
    if (!isEditing && !isLoading) {
      setDraftValue(maxAdminSessions === null ? "" : String(maxAdminSessions));
    }
  }, [maxAdminSessions, isLoading, isEditing]);

  function handleEditClick() {
    setIsEditing(true);
  }

  async function handleSaveClick() {
    // Empty field means "unlimited" — everything else must be a whole
    // number of at least 1 (enforced again server-side either way).
    const trimmed = draftValue.trim();
    if (trimmed !== "" && (!/^\d+$/.test(trimmed) || Number(trimmed) < 1)) {
      showToast("✕ Enter a whole number of at least 1, or leave it blank for unlimited.", "error");
      return;
    }

    setIsSaving(true);
    try {
      await saveLimit(trimmed === "" ? null : Number(trimmed));
      showToast(
        trimmed === ""
          ? "✓ Admin access limit set to unlimited."
          : `✓ Admin access limit set to ${trimmed}.`,
        "success"
      );
      setIsEditing(false);
    } catch (saveError) {
      const message = saveError?.response?.data?.message || "We couldn't save this setting. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="adminAccessLimitPage">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="adminAccessLimitHeaderRow">
        <span className="adminAccessLimitEyebrow">Settings</span>
        <h1 className="adminAccessLimitPageTitle">Admin Access Limit</h1>
        <p className="adminAccessLimitSubtitle">
          Set how many devices or browsers can be logged in to the super-admin area at the same time.
          Leave it blank to allow unlimited admins.
        </p>
      </div>

      {isLoading && <p className="adminAccessLimitHint">Loading current setting…</p>}
      {!isLoading && error && <p className="adminAccessLimitFormError">{error}</p>}

      {!isLoading && !error && (
        <div className="adminAccessLimitCard">
          <p className="adminAccessLimitActiveCount">
            Currently signed in: <strong>{activeSessionCount}</strong>
          </p>

          <div className="adminAccessLimitFormField">
            <label htmlFor="maxAdminSessions">Maximum admins allowed</label>
            <input
              id="maxAdminSessions"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="Unlimited"
              value={draftValue}
              disabled={!isEditing || isSaving}
              onChange={(event) => setDraftValue(event.target.value)}
            />
          </div>

          <div className="adminAccessLimitFormActions">
            <button
              type="button"
              className="adminAccessLimitButton adminAccessLimitButton--neutral"
              onClick={handleEditClick}
              disabled={isEditing || isSaving}
            >
              Edit
            </button>
            <button
              type="button"
              className="adminAccessLimitButton adminAccessLimitButton--primary"
              onClick={handleSaveClick}
              disabled={!isEditing || isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
