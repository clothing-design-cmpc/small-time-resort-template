/**
 * FILE: app/system-vault/[vaultSlug]/VaultIdleTimeoutGuard.jsx
 * ROLE: Standalone — mounted only inside RecoveryClient.jsx, after both
 *       vault login factors (passphrase + OTP) are already satisfied
 *
 * PURPOSE:
 * Locks the vault after VAULT_IDLE_TIMEOUT_MINUTES of no mouse,
 * keyboard, scroll, or touch activity — mirrors
 * components/superAdmin/IdleTimeoutGuard.jsx, reusing the same
 * hooks/useIdleTimeout.js hook, but for a DIFFERENT gap than
 * RecoveryClient's existing visibilitychange-based auto-lock covers.
 * That one only fires once this tab/window is actually hidden (lid
 * closed, device asleep, tab switched away). It does nothing if the
 * tab stays open and visible but genuinely untouched — a device left
 * unlocked and unattended on this screen, awake the whole time, would
 * sit here indefinitely with no client-side check catching it. This
 * guard closes that gap.
 *
 * A shorter window than the normal admin area's 30 minutes is used
 * deliberately — this is the single most privileged screen in the
 * app (database wipe, blocked-IP list, ending a breach lockdown), the
 * same reasoning RecoveryClient's own comments already give for using
 * a stricter 30-SECOND grace period on the tab-hidden lock instead of
 * the general 30-minute idle standard.
 *
 * A distinct sessionStorage key is passed to useIdleTimeout() so this
 * guard's deadline is never confused with the normal admin area's
 * — otherwise navigating from /superAdmin into the vault in the same
 * tab would inherit the admin's already-running 30-minute deadline
 * instead of starting this guard's own shorter one (see
 * hooks/useIdleTimeout.js's file header for the full reasoning).
 *
 * DATA FLOW:
 * 1. Mounted inside RecoveryClient.jsx once the recovery dashboard
 *    itself is rendering (both vault factors already satisfied)
 * 2. hooks/useIdleTimeout.js tracks activity and fires
 *    handleVaultIdleLock() after VAULT_IDLE_TIMEOUT_MINUTES of none
 * 3. handleVaultIdleLock() DELETEs /api/admin/vault-login — the same
 *    endpoint RecoveryClient's own "Lock Vault" button and its
 *    tab-hidden auto-lock already use — clearing just the
 *    "vaultSession" cookie, then redirects to this slug's own
 *    /login?reason=idle-timeout
 * 4. VaultIdleTimeoutNotice (mounted on the login screen) reads that
 *    query param and explains why the admin landed back there
 */
"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const VAULT_IDLE_TIMEOUT_MINUTES = 5;
const VAULT_IDLE_STORAGE_KEY = "vault:idleDeadline";

export default function VaultIdleTimeoutGuard() {
  const router = useRouter();
  // Never hardcoded — changes on every passphrase rotation
  // (services/vaultAuth.js's computeVaultUrlSlug()).
  const { vaultSlug } = useParams();

  /**
   * handleVaultIdleLock
   * Fired after VAULT_IDLE_TIMEOUT_MINUTES of no tracked activity.
   * Clears the "vaultSession" cookie server-side first, then always
   * redirects — even if the DELETE call fails — same reasoning as
   * RecoveryClient's own handleLockVault: a device stuck on a dead
   * request is worse than a cookie that lingers a few seconds longer.
   */
  const handleVaultIdleLock = useCallback(async () => {
    try {
      await fetch("/api/admin/vault-login", { method: "DELETE" });
    } catch {
      // Ignore — the cookie may already be gone or the request timed
      // out; either way, still send the admin back to this slug's
      // own login screen.
    } finally {
      router.push(`/system-vault/${vaultSlug}/login?reason=idle-timeout`);
    }
  }, [router, vaultSlug]);

  useIdleTimeout(handleVaultIdleLock, VAULT_IDLE_TIMEOUT_MINUTES, VAULT_IDLE_STORAGE_KEY);

  return null;
}
