/**
 * FILE: app/system-vault/[vaultSlug]/RecoveryClient.jsx
 * ROLE: Standalone — not gated by proxy.js or any super_admin session;
 *       reachable only after both vault factors (passphrase + emailed
 *       OTP) are satisfied, enforced by page.jsx's server-side redirect
 *       chain and re-checked by every /api/admin/breach and
 *       /api/admin/blocked-ips call below.
 *
 * PURPOSE:
 * The actual recovery workflow: shows which gatekeeper tripped and
 * when, reuses the existing useSqlImport hook (same one the normal
 * Backups page uses) so importing the pre-breach Google Drive/R2 SQL
 * backup works identically here, exposes an "End Lockdown" action once
 * the super-admin has confirmed the restore looks right, and — new —
 * lets the owner unban any IP currently in BlockedIp, each unban
 * gated by its own fresh emailed step-up code (never just the vault
 * session that got them into this dashboard).
 *
 * DATA FLOW:
 * 1. On mount, GET /api/admin/breach loads the active (unresolved)
 *    BreachEvent plus SystemSettings.breachLockdown
 * 2. On mount, GET /api/admin/blocked-ips loads the current BlockedIp
 *    rows for the new "Step 3 — Unban an IP" list
 * 3. Uploading a .sql/.sql.gz file goes through the same
 *    POST /api/admin/sql-import -> database-restore.yml pipeline the
 *    Backups page already uses — nothing new to build there
 * 4. "End Lockdown" PATCHes /api/admin/breach, which resolves the
 *    BreachEvent and flips breachLockdown + maintenanceMode off
 * 5. Clicking "Unban" on a blocked IP opens UnbanIpModal, which
 *    requests a fresh code (POST /api/admin/blocked-ips/request-
 *    unban-code) and, on confirm, PATCHes /api/admin/blocked-ips/unban
 *    with { ipAddress, code } — only then is the row actually deleted
 * 6. "Lock Vault" DELETEs /api/admin/vault-login, clearing the
 *    "vaultSession" cookie and sending the admin back to this same
 *    slug's own login screen without touching their regular
 *    super-admin session. A 401 from any GET above (vault session
 *    expired mid-visit, e.g. the 30-minute window ran out while this
 *    tab was open) does the same redirect automatically.
 * 7. The same DELETE also fires automatically, without any click, the
 *    instant the tab is closed, the browser is closed, the device
 *    sleeps (useLogoutOnHidden — all three hide the page identically),
 *    or 30 minutes pass with zero interaction while the tab stays
 *    open (useIdleTimeout, hooks/useIdleTimeout.js) — a disaster-
 *    recovery session is never left silently valid in the background.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import { useSqlImport } from "@/hooks/useSqlImport";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useLogoutOnHidden } from "@/hooks/useLogoutOnHidden";
import UnbanIpModal from "./UnbanIpModal";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const GATEKEEPER_LABELS = {
  1: "Gatekeeper 1 — Login brute force",
  2: "Gatekeeper 2 — SQL injection attempt",
  3: "Gatekeeper 3 — Anomalous admin login",
};

export default function RecoveryClient() {
  const router = useRouter();
  // The current URL's own slug — never hardcoded, since it changes on
  // every passphrase rotation (services/vaultAuth.js's computeVaultUrlSlug).
  const { vaultSlug } = useParams();
  const { toasts, showToast, dismissToast } = useToast();

  const [breachLockdown, setBreachLockdown] = useState(false);
  const [activeBreach, setActiveBreach] = useState(null);
  const [recentBreaches, setRecentBreaches] = useState([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [isEndLockdownModalOpen, setIsEndLockdownModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const { importLogs, isLoading: isImportHistoryLoading, uploadSqlFile } = useSqlImport();

  // --- Step 3: Unban an IP ---
  const [blockedIps, setBlockedIps] = useState([]);
  const [isLoadingBlockedIps, setIsLoadingBlockedIps] = useState(true);
  const [blockedIpsError, setBlockedIpsError] = useState(null);
  const [selectedIpToUnban, setSelectedIpToUnban] = useState(null); // ipAddress string pending step-up

  /**
   * fetchBreachStatus
   * Loads the current lockdown state — called on mount and again after
   * ending the lockdown so the page reflects reality without a full reload.
   */
  const fetchBreachStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const response = await axios.get("/api/admin/breach");
      const result = response.data;
      setBreachLockdown(result.data.breachLockdown);
      setActiveBreach(result.data.activeBreach);
      setRecentBreaches(result.data.recentBreaches);
    } catch (error) {
      // 401 here means the vault session expired (30-minute window,
      // services/vaultAuth.js) or was never valid to begin with — send
      // back to the vault's own login screen rather than showing a
      // recovery page with stale/empty status.
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      showToast("✕ Couldn't load breach status.", "error");
    } finally {
      setIsLoadingStatus(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, vaultSlug]);

  /**
   * fetchBlockedIps
   * Loads the current Step 3 list. Runs on mount and again after any
   * successful unban so the list reflects reality immediately.
   */
  const fetchBlockedIps = useCallback(async () => {
    setIsLoadingBlockedIps(true);
    setBlockedIpsError(null);
    try {
      const response = await axios.get("/api/admin/blocked-ips");
      setBlockedIps(response.data.data.blockedIps);
    } catch (error) {
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      setBlockedIpsError("Failed to load blocked IPs. Please try again.");
    } finally {
      setIsLoadingBlockedIps(false);
    }
  }, [router, vaultSlug]);

  useEffect(() => {
    fetchBreachStatus();
    fetchBlockedIps();
  }, [fetchBreachStatus, fetchBlockedIps]);

  /**
   * handleFileSelected
   * Holds the picked file in state so ConfirmationModal can show the
   * exact file name before anything is actually restored (Rule 34.4) —
   * a database restore is the single most destructive action in this app.
   */
  function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (file) setPendingImportFile(file);
  }

  async function handleConfirmImport() {
    try {
      const result = await uploadSqlFile(pendingImportFile);
      showToast(`✓ ${result.message}`, "success");
    } catch (error) {
      const message = error.response?.data?.message || "Failed to start the import. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setPendingImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /**
   * handleEndLockdown
   * Runs after the admin confirms the modal. Only meant to be used
   * once the restored database has actually been verified — there is
   * no automatic check here that the import succeeded, that judgment
   * call is deliberately left to the super-admin.
   */
  async function handleEndLockdown() {
    try {
      const response = await axios.patch("/api/admin/breach");
      showToast(`✓ ${response.data.message}`, "success");
      await fetchBreachStatus();
    } catch (error) {
      const message = error.response?.data?.message || "Failed to end the lockdown. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsEndLockdownModalOpen(false);
    }
  }

  /**
   * handleConfirmUnban
   * Called by UnbanIpModal once the owner submits the fresh step-up
   * code. Only PATCHes /api/admin/blocked-ips/unban — the row is only
   * ever deleted server-side, after that route's own verifyVaultOtp()
   * check passes.
   */
  async function handleConfirmUnban(code) {
    try {
      const response = await axios.patch("/api/admin/blocked-ips/unban", {
        ipAddress: selectedIpToUnban,
        code,
      });
      showToast(`✓ ${response.data.message}`, "success");
      setSelectedIpToUnban(null);
      await fetchBlockedIps();
    } catch (error) {
      const message = error.response?.data?.message || "Failed to unban that IP. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  /**
   * handleLockVault
   * Clears just the "vaultSession" cookie (DELETE /api/admin/vault-login)
   * and sends the admin back to the vault's own login screen — the
   * regular super-admin session is untouched, so they stay signed in
   * to the rest of /superAdmin/* and only re-enter the vault passphrase
   * if they need this page again.
   */
  async function handleLockVault() {
    try {
      await axios.delete("/api/admin/vault-login");
    } catch {
      // Best-effort — even if the request fails, still navigate away;
      // the server-side page check will re-verify on the next visit.
    } finally {
      router.push(`/system-vault/${vaultSlug}/login`);
    }
  }

  /**
   * logoutBeacon
   * Fire-and-forget session clear for the "the page might be going
   * away right now" case below (tab/browser closing, or device sleep).
   * Deliberately does NOT router.push() — if the page is actually
   * closing there's nowhere to navigate to, and pushing a route change
   * on a document that's mid-unload has no effect anyway. keepalive:
   * true is what actually matters here — it's what lets this specific
   * request survive the page unloading, which a normal fetch or axios
   * call does not guarantee.
   */
  function logoutBeacon() {
    fetch("/api/admin/vault-login", { method: "DELETE", keepalive: true }).catch(() => {
      // Nothing to recover here — the page is closing or the user has
      // already walked away either way.
    });
  }

  // Covers closing the tab, closing the browser, and the device
  // sleeping — all three hide this page the same way from inside it
  // (see hooks/useLogoutOnHidden.js for why one listener covers all
  // three, and the tab-switch trade-off that comes with it).
  useLogoutOnHidden(logoutBeacon);

  // Separate safety net for the case visibilitychange doesn't cover:
  // the tab stays visible and in the foreground, but the owner simply
  // walks away without touching the page. Reuses handleLockVault
  // directly (not logoutBeacon) — unlike the hidden/closing case, the
  // tab is still open here, so redirecting to the login screen is both
  // possible and the clearer signal that the session actually ended,
  // rather than leaving the recovery page sitting there looking
  // unchanged until the next click happens to 401. Same 30-minute
  // ceiling as the cookie's own server-side expiry
  // (VAULT_SESSION_COOKIE_MAX_AGE_SECONDS, services/vaultAuth.js) —
  // this just ends the visit proactively instead of waiting for the
  // next fetch to bounce off a 401.
  useIdleTimeout(handleLockVault, 30);

  return (
    <section className="recoveryContent">
      {/* recoveryContent (Recovery.css) supplies the max-width, page
          padding, and vertical gap between the cards below — this
          section previously used an unstyled "recoverySection" class
          and rendered full-bleed with no spacing. */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="recoveryHeaderRow">
        <div>
          <span className="recoveryEyebrow">Disaster Recovery</span>
          <h1>System Recovery</h1>
          <p className="recoverySubtext">
            Restricted disaster-recovery workflow. Not linked from anywhere in the admin panel.
          </p>
        </div>
        <div className="recoveryHeaderActions">
          {!isLoadingStatus && (
            <span className={breachLockdown ? "recoveryLockdownBadgeActive" : "recoveryLockdownBadgeClear"}>
              {/* A plain colored dot, not an emoji glyph — pulses only in
                  the active-lockdown state so the one piece of info that
                  actually needs attention is the one that visibly moves. */}
              <span className="recoveryLockdownDot" aria-hidden="true" />
              {breachLockdown ? "Website is currently locked down" : "No active lockdown"}
            </span>
          )}
          {/* Locks just the vault passphrase gate again — the admin's
              regular super-admin session (and access to /superAdmin/*)
              is unaffected. */}
          <button type="button" className="recoveryLockVaultButton" onClick={handleLockVault}>
            Lock Vault
          </button>
        </div>
      </div>

      {/* --- Active incident details --- */}
      {activeBreach && (
        <div className="recoveryIncidentCard">
          <h2>Active Incident</h2>
          <dl className="recoveryIncidentDetails">
            <dt>Gatekeeper</dt>
            <dd>{GATEKEEPER_LABELS[activeBreach.gatekeeper] ?? `Gatekeeper ${activeBreach.gatekeeper}`}</dd>
            <dt>IP address</dt>
            <dd>{activeBreach.ipAddress ?? "Unknown"}</dd>
            <dt>Detail</dt>
            <dd>{activeBreach.details}</dd>
            <dt>Occurred</dt>
            <dd>{DATE_FORMATTER.format(new Date(activeBreach.createdAt))}</dd>
            <dt>Auto-backup dispatched</dt>
            <dd>{activeBreach.backupTriggered ? "Yes — check the Backups page for the resulting file." : "No — trigger one manually below before restoring."}</dd>
            <dt>Alert email sent</dt>
            <dd>{activeBreach.emailSent ? "Yes" : "No"}</dd>
          </dl>
        </div>
      )}

      {/* --- Step 1: Import the pre-breach SQL backup --- */}
      <div className="recoveryStepCard">
        <h2>Step 1 — Import the SQL Backup</h2>
        <p>
          Open the linked Google Drive backup from the Backups page (or your email alert), download the
          .sql file, and upload it here to restore the database.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sql,.sql.gz"
          onChange={handleFileSelected}
          className="recoveryFileInput"
        />
        {importLogs.length > 0 && (
          <ul className="recoveryImportHistory">
            {importLogs.slice(0, 5).map((log) => (
              <li key={log.id}>
                <StatusBadge status={log.status} />
                <span className="adminMono">
                  {log.fileName} — {DATE_FORMATTER.format(new Date(log.startedAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isImportHistoryLoading && <p className="recoveryMutedText">Loading import history…</p>}
      </div>

      {/* --- Step 2: End lockdown once restore is verified --- */}
      <div className="recoveryStepCard">
        <h2>Step 2 — End Lockdown</h2>
        <p>
          Once you&apos;ve confirmed the restored database looks correct, end the lockdown to bring the
          website back online for guests.
        </p>
        <button
          type="button"
          className="recoveryEndLockdownButton"
          disabled={!breachLockdown}
          onClick={() => setIsEndLockdownModalOpen(true)}
        >
          End Lockdown — Bring Website Back Online
        </button>
      </div>

      {/* --- Step 3: Unban an IP --- */}
      <div className="recoveryStepCard">
        <h2>Step 3 — Unban an IP</h2>
        <p>
          IPs currently blocked by Gatekeeper 1 or 2 (or added manually). Unbanning requires a fresh
          verification code emailed to you — your vault session alone is not enough.
        </p>

        {isLoadingBlockedIps && <p className="recoveryMutedText">Loading blocked IPs…</p>}
        {!isLoadingBlockedIps && blockedIpsError && (
          <p className="recoveryMutedText">{blockedIpsError}</p>
        )}
        {!isLoadingBlockedIps && !blockedIpsError && blockedIps.length === 0 && (
          <p className="recoveryMutedText">No IPs are currently blocked.</p>
        )}

        {!isLoadingBlockedIps && !blockedIpsError && blockedIps.length > 0 && (
          <ul className="recoveryImportHistory">
            {blockedIps.map((blocked) => (
              <li key={blocked.id}>
                <div className="recoveryBlockedIpInfo">
                  <span className="adminMono">{blocked.ipAddress}</span>
                  <span className="recoveryMutedText">
                    {blocked.reason}
                    {blocked.gatekeeper ? ` — Gatekeeper ${blocked.gatekeeper}` : ""} ·{" "}
                    {DATE_FORMATTER.format(new Date(blocked.createdAt))}
                  </span>
                </div>
                <button
                  type="button"
                  className="recoveryUnbanButton"
                  onClick={() => setSelectedIpToUnban(blocked.ipAddress)}
                >
                  Unban
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Recent incident history --- */}
      {recentBreaches.length > 0 && (
        <div className="recoveryStepCard">
          <h2>Recent Gatekeeper Trips</h2>
          <ul className="recoveryImportHistory">
            {recentBreaches.map((event) => (
              <li key={event.id}>
                <StatusBadge status={event.resolved ? "success" : "failed"} />
                <span className="adminMono">
                  {GATEKEEPER_LABELS[event.gatekeeper] ?? `Gatekeeper ${event.gatekeeper}`} —{" "}
                  {DATE_FORMATTER.format(new Date(event.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(pendingImportFile)}
        title="Restore Database from Backup?"
        description={`This will overwrite the current database with the contents of "${pendingImportFile?.name}". This cannot be undone.`}
        confirmLabel="Restore Database"
        onConfirm={handleConfirmImport}
        onCancel={() => {
          setPendingImportFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      <ConfirmationModal
        isOpen={isEndLockdownModalOpen}
        title="End Lockdown?"
        description="This will bring the website back online for every guest immediately. Only confirm once you've verified the restored database looks correct."
        confirmLabel="End Lockdown"
        onConfirm={handleEndLockdown}
        onCancel={() => setIsEndLockdownModalOpen(false)}
      />

      {selectedIpToUnban && (
        <UnbanIpModal
          ipAddress={selectedIpToUnban}
          onConfirm={handleConfirmUnban}
          onCancel={() => setSelectedIpToUnban(null)}
        />
      )}
    </section>
  );
}
