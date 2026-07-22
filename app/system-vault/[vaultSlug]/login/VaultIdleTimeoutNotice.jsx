/**
 * FILE: app/system-vault/[vaultSlug]/login/VaultIdleTimeoutNotice.jsx
 * ROLE: Public — rendered on the vault's own login screen only
 *
 * PURPOSE:
 * Mirrors app/superAdmin/login/IdleTimeoutNotice.jsx: shows a plain-
 * English reason when the vault was just auto-locked and redirected
 * here, instead of landing back on a bare passphrase form with no
 * explanation. Split into its own file for the same reason as the
 * admin version — only this small piece needs the Suspense boundary
 * useSearchParams() requires.
 *
 * DATA FLOW:
 * 1. VaultIdleTimeoutGuard (../VaultIdleTimeoutGuard.jsx) redirects
 *    here with ?reason=idle-timeout after 5 minutes of no mouse/
 *    keyboard/scroll/touch activity on the recovery dashboard
 * 2. This component reads that query param and renders the notice
 * 3. Any other/missing reason value renders nothing
 */
"use client";

import { useSearchParams } from "next/navigation";

const REASON_MESSAGES = {
  "idle-timeout": "The vault locked due to inactivity. Enter the passphrase again to continue.",
};

export default function VaultIdleTimeoutNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const message = REASON_MESSAGES[reason];

  if (!message) return null;

  return (
    <p role="status" className="vaultLoginAuthError">
      {message}
    </p>
  );
}
