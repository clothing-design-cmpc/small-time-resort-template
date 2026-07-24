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
 * the super-admin has confirmed the restore looks right, and lets the
 * owner unban any IP currently in BlockedIp. Step 3 has TWO separate
 * step-up checkpoints, each its own fresh emailed code: one just to
 * reveal who's currently blocked (VaultCodeConfirmModal, "View Blocked
 * IPs"), and a second, distinct one to actually unban any individual
 * row (UnbanIpModal) — a vault session alone is never enough for
 * either.
 *
 * DATA FLOW:
 * 1. On mount, GET /api/admin/breach loads the active (unresolved)
 *    BreachEvent plus SystemSettings.breachLockdown
 * 2. Step 3 starts collapsed behind a "View Blocked IPs" button.
 *    Clicking it opens VaultCodeConfirmModal, which requests a code
 *    (POST /api/admin/blocked-ips/request-view-code) and, on confirm,
 *    calls GET /api/admin/blocked-ips?code=... — only a correct code
 *    reveals the list, and that code is then spent (one-time-use)
 * 3. Uploading a .sql/.sql.gz file goes through the same
 *    POST /api/admin/sql-import -> database-restore.yml pipeline the
 *    Backups page already uses — nothing new to build there
 * 4. "End Lockdown" PATCHes /api/admin/breach, which resolves the
 *    BreachEvent and flips breachLockdown + maintenanceMode off
 * 5. Clicking "Unban" on a blocked IP opens UnbanIpModal, which
 *    requests its OWN fresh code (POST /api/admin/blocked-ips/request-
 *    unban-code — a different code than the one that revealed the
 *    list) and, on confirm, PATCHes /api/admin/blocked-ips/unban with
 *    { ipAddress, code } — only then is the row actually deleted. The
 *    row is removed from local state directly afterward rather than
 *    re-fetching the gated list, so a successful unban never demands a
 *    third code just to see the updated list.
 * 6. "Lock Vault" DELETEs /api/admin/vault-login, clearing the
 *    "vaultSession" cookie and sending the admin back to this same
 *    slug's own login screen without touching their regular
 *    super-admin session. A 401 from any GET above (vault session
 *    expired mid-visit, e.g. the 30-minute window ran out while this
 *    tab was open) does the same redirect automatically. The exact
 *    same lock also fires automatically once this tab/window has been
 *    hidden for 30 straight seconds (device sleep, lid close,
 *    backgrounding, tab switch) — see the visibilitychange effect
 *    below handleLockVault. A quick tab switch under 30 seconds does
 *    not trigger it. This is timestamp-based, not just a bare
 *    setTimeout: a setTimeout scheduled while hidden can be delayed by
 *    background-tab throttling, or never fire at all if the OS fully
 *    suspends the tab (lid close, device sleep) — so the real moment
 *    the tab went hidden is also stored and re-checked the instant it
 *    becomes visible again, in case the pending timer never got the
 *    chance to run.
 * 7. Post-Wipe Lockdown (Task 2) — independent of the breach flow
 *    above. GET /api/admin/post-wipe-lockdown polls whether
 *    scripts/runDatabaseWipe.js has locked the site down after a
 *    completed wipe; "Lift Post-Wipe Lockdown" PATCHes the same route
 *    to bring both the visitor site AND super-admin back online.
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
import UnbanIpModal from "./UnbanIpModal";
import VaultCodeConfirmModal from "./VaultCodeConfirmModal";
import VaultDangerZoneSection from "./VaultDangerZoneSection";
import VaultIdleTimeoutGuard from "./VaultIdleTimeoutGuard";
import VaultWipeGraceModal from "./VaultWipeGraceModal";
import ApiSetupGuideSection from "./ApiSetupGuideSection";
import EnvCheckerSection from "./EnvCheckerSection";
import RecoveryCardSection from "./RecoveryCardSection";
import VaultGatekeeperTesterSection from "./VaultGatekeeperTesterSection";
import SystemHealthCheckSection from "./SystemHealthCheckSection";
import ScriptsReferenceSection from "./ScriptsReferenceSection";

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

  // --- Post-Wipe Lockdown (Task 2) — separate flag from breachLockdown
  // above, set only by scripts/runDatabaseWipe.js once a scheduled
  // wipe's TRUNCATE actually succeeds. See app/api/admin/post-wipe-
  // lockdown/route.js and services/postWipeLockdown.js.
  const [postWipeLockdown, setPostWipeLockdown] = useState(false);
  const [postWipeLockdownAt, setPostWipeLockdownAt] = useState(null);
  const [isLoadingPostWipeStatus, setIsLoadingPostWipeStatus] = useState(true);
  const [isLiftPostWipeModalOpen, setIsLiftPostWipeModalOpen] = useState(false);

  const [pendingImportFile, setPendingImportFile] = useState(null);
  // Task 6 — Backup integrity check. Computed client-side (never
  // uploaded anywhere just to get this value) so the owner can eyeball-
  // compare it against the checksum shown on the super-admin Backups
  // page for the specific backup they downloaded, before trusting this
  // file for a restore.
  const [pendingFileChecksum, setPendingFileChecksum] = useState(null);
  const [isComputingChecksum, setIsComputingChecksum] = useState(false);
  const [isEndLockdownModalOpen, setIsEndLockdownModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const { importLogs, isLoading: isImportHistoryLoading, uploadSqlFile } = useSqlImport();

  // Mirrors the server-side guard in PATCH /api/admin/post-wipe-lockdown —
  // sql_import_logs is truncated by every wipe, so any "success" row
  // dated at/after postWipeLockdownAt proves a restore actually ran
  // since this lockdown started. Used only to disable the button and
  // explain why up front; the API call above is still the real gate.
  const hasSuccessfulRestoreSincePostWipeLockdown = importLogs.some(
    (log) =>
      log.status === "success" &&
      (!postWipeLockdownAt || new Date(log.completedAt) >= new Date(postWipeLockdownAt))
  );

  // --- Step 3: Unban an IP ---
  // The list itself stays hidden (isBlockedIpsRevealed: false) until
  // its own step-up code is confirmed — see handleRevealBlockedIps.
  const [blockedIps, setBlockedIps] = useState([]);
  const [isBlockedIpsRevealed, setIsBlockedIpsRevealed] = useState(false);
  const [isLoadingBlockedIps, setIsLoadingBlockedIps] = useState(false);
  const [blockedIpsError, setBlockedIpsError] = useState(null);
  const [isViewCodeModalOpen, setIsViewCodeModalOpen] = useState(false);
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

  useEffect(() => {
    fetchBreachStatus();
    // Step 3's list is deliberately NOT fetched here — it only loads
    // once the owner completes handleRevealBlockedIps' own step-up code.
  }, [fetchBreachStatus]);

  /**
   * fetchPostWipeLockdownStatus
   * Loads the current post-wipe lockdown state — called on mount and
   * again after lifting it so the page reflects reality without a
   * full reload. Kept separate from fetchBreachStatus() above since
   * the two flags are independent and set by entirely different code
   * paths (a gatekeeper trip vs. a completed scheduled wipe).
   */
  const fetchPostWipeLockdownStatus = useCallback(async () => {
    setIsLoadingPostWipeStatus(true);
    try {
      const response = await axios.get("/api/admin/post-wipe-lockdown");
      const result = response.data;
      setPostWipeLockdown(result.data.postWipeLockdown);
      setPostWipeLockdownAt(result.data.postWipeLockdownAt);
    } catch (error) {
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      showToast("✕ Couldn't load post-wipe lockdown status.", "error");
    } finally {
      setIsLoadingPostWipeStatus(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, vaultSlug]);

  useEffect(() => {
    fetchPostWipeLockdownStatus();
  }, [fetchPostWipeLockdownStatus]);

  /**
   * handleLiftPostWipeLockdown
   * Runs after the vault owner confirms the modal. Same "no automatic
   * verification, judgment call is deliberately left to the human"
   * reasoning as handleEndLockdown below.
   */
  async function handleLiftPostWipeLockdown() {
    try {
      const response = await axios.patch("/api/admin/post-wipe-lockdown");
      showToast(`✓ ${response.data.message}`, "success");
      await fetchPostWipeLockdownStatus();
    } catch (error) {
      const message = error.response?.data?.message || "Failed to lift the lockdown. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsLiftPostWipeModalOpen(false);
    }
  }

  /**
   * handleRevealBlockedIps
   * Called by VaultCodeConfirmModal once the owner submits the fresh
   * "view" code. GET /api/admin/blocked-ips?code=... both verifies the
   * code AND returns the list in the same round trip — a wrong code
   * never reveals anything, and a correct one spends that code (it
   * can't be reused for a second view without requesting a new one).
   */
  async function handleRevealBlockedIps(code) {
    setIsLoadingBlockedIps(true);
    setBlockedIpsError(null);
    try {
      const response = await axios.get("/api/admin/blocked-ips", { params: { code } });
      setBlockedIps(response.data.data.blockedIps);
      setIsBlockedIpsRevealed(true);
      setIsViewCodeModalOpen(false);
    } catch (error) {
      if (error.response?.status === 401 && error.response?.data?.message === "Vault authentication required.") {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      showToast(`✕ ${error.response?.data?.message || "Failed to load blocked IPs."}`, "error");
    } finally {
      setIsLoadingBlockedIps(false);
    }
  }

  /**
   * handleFileSelected
   * Holds the picked file in state so ConfirmationModal can show the
   * exact file name before anything is actually restored (Rule 34.4) —
   * a database restore is the single most destructive action in this app.
   *
   * Task 6 addition: also computes the file's SHA-256 entirely
   * client-side via the browser's native SubtleCrypto — the file
   * itself never leaves the browser just to get this value. Shown next
   * to the picker so the owner can compare it against the checksum
   * recorded for the specific backup on the super-admin Backups page
   * before trusting it enough to restore.
   */
  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPendingImportFile(file);
    setPendingFileChecksum(null);
    setIsComputingChecksum(true);
    try {
      const fileBuffer = await file.arrayBuffer();
      const digestBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
      const checksumHex = Array.from(new Uint8Array(digestBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      setPendingFileChecksum(checksumHex);
    } catch {
      // Never block the restore flow itself if the browser can't
      // compute a digest for some reason — the owner just won't have
      // a checksum to compare this time.
      setPendingFileChecksum(null);
    } finally {
      setIsComputingChecksum(false);
    }
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
      setPendingFileChecksum(null);
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
   * code (a separate one from the code that revealed the list). Only
   * PATCHes /api/admin/blocked-ips/unban — the row is only ever
   * deleted server-side, after that route's own verifyVaultOtp() check
   * passes. On success, the row is removed from local state directly
   * rather than re-fetching the gated list — that GET requires its own
   * fresh code too, and demanding a third code just to see the updated
   * list would be excessive here.
   */
  async function handleConfirmUnban(code) {
    try {
      const response = await axios.patch("/api/admin/blocked-ips/unban", {
        ipAddress: selectedIpToUnban,
        code,
      });
      showToast(`✓ ${response.data.message}`, "success");
      setBlockedIps((previousList) => previousList.filter((blocked) => blocked.ipAddress !== selectedIpToUnban));
      setSelectedIpToUnban(null);
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

  // Auto-lock after this tab/window has stayed hidden for
  // AUTO_LOCK_GRACE_PERIOD_MS — covers closing the laptop lid, the
  // device going to sleep, switching to another app, or backgrounding
  // the tab. The Page Visibility API (`visibilitychange` ->
  // document.visibilityState === "hidden") is the closest a web page
  // can get to detecting "device slept" or "lid closed" directly,
  // since neither is exposed as its own browser event — in practice,
  // OSes stop rendering/suspend the tab on sleep, which reliably fires
  // this same event.
  //
  // This page is the single most privileged screen in the app (full
  // disaster-recovery access: database wipe, the blocked-IP list,
  // ending a breach lockdown) so it intentionally gets a stricter rule
  // than the app's general 30-minute idle timeout (Rule 32.5) — locking
  // on loss of visibility rather than waiting out a fixed idle window,
  // since an unlocked device left sleeping/unattended is exactly the
  // scenario a timer alone wouldn't catch in time.
  //
  // A short 30-second grace period is deliberately used instead of an
  // instant lock so a quick tab switch (e.g. alt-tabbing to check a
  // GitHub Actions run mid-restore) doesn't force a fresh passphrase +
  // OTP re-entry — only staying away for the full 30 seconds triggers
  // the lock. Returning to the tab before the timer fires cancels it.
  const autoLockTimerRef = useRef(null);
  const hiddenAtRef = useRef(null);
  useEffect(() => {
    const AUTO_LOCK_GRACE_PERIOD_MS = 30 * 1000;

    function clearPendingLock() {
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        // Record the real wall-clock moment we went hidden. The
        // setTimeout below is only a best-effort trigger for the
        // common "tab just sat in the background" case — it can be
        // delayed by the browser's background-tab throttling, or
        // never run at all if the OS fully suspends this tab (lid
        // close, device sleep). hiddenAtRef is the source of truth,
        // re-checked below the instant the tab becomes visible again.
        hiddenAtRef.current = Date.now();
        autoLockTimerRef.current = setTimeout(() => {
          handleLockVault();
        }, AUTO_LOCK_GRACE_PERIOD_MS);
      } else {
        // Tab is visible again. If the device was asleep/suspended,
        // the setTimeout above never got the chance to fire — so
        // re-check the actual elapsed wall-clock time here instead of
        // just cancelling the pending timer outright. Only treat it
        // as "returned in time" if the grace period genuinely hasn't
        // elapsed yet.
        const hiddenAt = hiddenAtRef.current;
        clearPendingLock();
        hiddenAtRef.current = null;

        if (hiddenAt && Date.now() - hiddenAt >= AUTO_LOCK_GRACE_PERIOD_MS) {
          handleLockVault();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearPendingLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleLockVault
    // closes over vaultSlug/router only, both stable for this page's lifetime
  }, []);

  // Immediate lock on an actual tab/window close — separate from the
  // 30-second visibilitychange grace timer above, and for a real reason:
  // closing a tab also fires visibilitychange -> "hidden" first, but the
  // page's JS context is then torn down almost immediately afterward, so
  // that 30-second setTimeout (and the axios DELETE call inside
  // handleLockVault) never gets the chance to run. The vaultSession
  // cookie was left in place, so reopening the vault URL in a fresh tab
  // (browser still running) walked straight back into the still-valid
  // session instead of the login screen — closing the tab looked like it
  // locked nothing.
  //
  // "pagehide" is used (not "beforeunload", which is unreliable for
  // fire-and-forget network calls and increasingly restricted by
  // browsers) together with fetch's `keepalive: true`, which is
  // specifically designed to let a request outlive page teardown —
  // axios does not support this, hence calling fetch directly here
  // instead of handleLockVault. No 30-second wait: an actual tab close
  // should lock the vault right away, not after a delay meant for
  // brief tab switches.
  useEffect(() => {
    function handlePageHide() {
      fetch("/api/admin/vault-login", { method: "DELETE", keepalive: true }).catch(() => {
        // Best-effort — the page is already tearing down, nothing to
        // recover here. Server-side, the cookie's own 30-minute expiry
        // (services/vaultAuth.js) is still the final backstop either way.
      });
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  return (
    <section className="recoveryContent">
      {/* recoveryContent (Recovery.css) supplies the max-width, page
          padding, and vertical gap between the cards below — this
          section previously used an unstyled "recoverySection" class
          and rendered full-bleed with no spacing. */}
      {/* Locks the vault after 5 minutes of no mouse/keyboard/scroll/
          touch activity — covers the tab staying open and visible but
          genuinely untouched, which the visibilitychange auto-lock
          above does not catch. */}
      <VaultIdleTimeoutGuard />
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

      {/* --- Post-Wipe Lockdown (Task 2) — independent of the breach
          badge above. Shown whenever scripts/runDatabaseWipe.js has
          flipped SystemSettings.postWipeLockdown on. --- */}
      {!isLoadingPostWipeStatus && postWipeLockdown && (
        <div className="recoveryIncidentCard">
          <h2>Post-Wipe Lockdown Active</h2>
          <p>
            A scheduled database wipe completed{" "}
            {postWipeLockdownAt ? `on ${DATE_FORMATTER.format(new Date(postWipeLockdownAt))}` : "recently"}. The
            visitor site AND every super-admin page are fully blocked — any admin session was signed out
            automatically. Use &quot;Fix SQL&quot; below to re-import a backup if needed, then lift the lockdown
            once you&apos;ve confirmed the database looks right.
          </p>
          <button
            type="button"
            className="recoveryEndLockdownButton"
            disabled={!hasSuccessfulRestoreSincePostWipeLockdown}
            onClick={() => setIsLiftPostWipeModalOpen(true)}
          >
            Lift Post-Wipe Lockdown — Bring Website &amp; Super-Admin Back Online
          </button>
          {!hasSuccessfulRestoreSincePostWipeLockdown && (
            <p className="recoveryMutedText">
              Disabled until a backup finishes restoring successfully under &quot;Fix SQL&quot; below.
            </p>
          )}
        </div>
      )}

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
        <h2>Fix SQL</h2>
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
        {isComputingChecksum && <p className="recoveryMutedText">Computing checksum…</p>}
        {pendingFileChecksum && (
          <p className="recoveryMutedText">
            SHA-256: <span className="adminMono">{pendingFileChecksum}</span> — compare this against the
            checksum shown for this backup on the Backups page before restoring.
          </p>
        )}
        {importLogs.length > 0 && (
          <ul className="recoveryImportHistory">
            {importLogs.slice(0, 5).map((log) => (
              <li key={log.id}>
                <StatusBadge status={log.status} />
                <span className="adminMono">
                  {log.fileName} — {DATE_FORMATTER.format(new Date(log.startedAt))}
                </span>
                {log.status === "running" && (
                  <span className="recoveryMutedText">Restoring on GitHub Actions — checking every few seconds…</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {isImportHistoryLoading && <p className="recoveryMutedText">Loading import history…</p>}
      </div>

      {/* --- Step 2: End lockdown once restore is verified ---
          Gated on breachLockdown (the flag that actually controls what
          guests see, per app/visitor/layout.jsx) — NOT on activeBreach.
          Those two can desync: a BreachEvent row can end up resolved/
          missing while SystemSettings.breachLockdown is still true (or
          vice versa). Gating this card on activeBreach alone meant that
          whenever they desynced with breachLockdown still true, this
          card — the ONLY UI path to clear the flag — never rendered at
          all, leaving no button anywhere to end the lockdown. Showing
          it whenever breachLockdown is true (regardless of whether an
          activeBreach row happens to exist) guarantees the exit is
          always reachable. */}
      {breachLockdown && (
        <div className="recoveryStepCard">
          <h2>Confirmation of Fixed Database</h2>
          <p>
            Once you&apos;ve confirmed the restored database looks correct, end the lockdown to bring the
            website back online for guests.
          </p>
          <button
            type="button"
            className="recoveryEndLockdownButton"
            onClick={() => setIsEndLockdownModalOpen(true)}
          >
            End Lockdown — Bring Website Back Online
          </button>
          {!activeBreach && (
            <p className="recoveryMutedText">
              No active incident row was found, but the lockdown flag is still on — clicking this will still
              clear it.
            </p>
          )}
        </div>
      )}

      {/* --- Step 3: Unban an IP --- */}
      <div className="recoveryStepCard">
        <h2>Unban IP</h2>
        <p>
          IPs currently blocked by Gatekeeper 1 or 2 (or added manually). The list itself stays hidden
          until you confirm a fresh verification code emailed to you — your vault session alone is not
          enough to even see it. Unbanning afterward requires a second, separate fresh code.
        </p>

        {!isBlockedIpsRevealed && (
          <button
            type="button"
            className="recoveryUnbanButton"
            onClick={() => setIsViewCodeModalOpen(true)}
            disabled={isLoadingBlockedIps}
          >
            {isLoadingBlockedIps ? "Loading…" : "View Blocked IPs"}
          </button>
        )}

        {isBlockedIpsRevealed && blockedIpsError && <p className="recoveryMutedText">{blockedIpsError}</p>}
        {isBlockedIpsRevealed && !blockedIpsError && blockedIps.length === 0 && (
          <p className="recoveryMutedText">No IPs are currently blocked.</p>
        )}

        {isBlockedIpsRevealed && !blockedIpsError && blockedIps.length > 0 && (
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
        description={`This will overwrite the current database with the contents of "${pendingImportFile?.name}". This cannot be undone.${
          pendingFileChecksum ? ` SHA-256: ${pendingFileChecksum}` : ""
        }`}
        confirmLabel="Restore Database"
        onConfirm={handleConfirmImport}
        onCancel={() => {
          setPendingImportFile(null);
          setPendingFileChecksum(null);
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

      <ConfirmationModal
        isOpen={isLiftPostWipeModalOpen}
        title="Lift Post-Wipe Lockdown?"
        description="This will bring the visitor website AND the super-admin dashboard back online for everyone immediately. Only confirm once you've verified the database looks correct."
        confirmLabel="Lift Lockdown"
        onConfirm={handleLiftPostWipeLockdown}
        onCancel={() => setIsLiftPostWipeModalOpen(false)}
      />

      {isViewCodeModalOpen && (
        <VaultCodeConfirmModal
          title="Confirm It's You"
          description="Enter the fresh verification code just emailed to you to view the list of blocked IPs."
          confirmLabel="View Blocked IPs"
          requestCodeEndpoint="/api/admin/blocked-ips/request-view-code"
          onConfirm={handleRevealBlockedIps}
          onCancel={() => setIsViewCodeModalOpen(false)}
        />
      )}

      {selectedIpToUnban && (
        <UnbanIpModal
          ipAddress={selectedIpToUnban}
          onConfirm={handleConfirmUnban}
          onCancel={() => setSelectedIpToUnban(null)}
        />
      )}

      {/* --- API & Service Setup Guide (Task 3) — how to set each
          service up, right above the checker that confirms whether it
          actually was. --- */}
      <ApiSetupGuideSection />

      {/* --- Environment Check (Task 3) --- */}
      <EnvCheckerSection showToast={showToast} />

      {/* --- System Health Check — DB connectivity, core tables, and
          double-booking conflict detection. Right after Environment
          Check since both are on-demand, read-only diagnostics. --- */}
      <SystemHealthCheckSection showToast={showToast} />

      {/* --- Scripts Reference — static list of every /scripts entry,
          what it does, and when to run it, so a developer never has
          to open each file just to remember. --- */}
      <ScriptsReferenceSection />

      {/* --- Printable Recovery Card (Task 4) --- */}
      <RecoveryCardSection />

      {/* --- Gatekeeper Tester — moved in here from its own standalone
          hidden page/passphrase, same reasoning as the Danger Zone and
          Recovery Channels sections above: one vault, one passphrase,
          not a second separate secret to manage. --- */}
      <VaultGatekeeperTesterSection showToast={showToast} />

      {/* --- Danger Zone: schedule/cancel/truncate-now a database wipe --- */}
      <VaultDangerZoneSection showToast={showToast} />

      {/* --- Final 2-hour checkpoint, mirrors DatabaseWipeGraceModal on
          the super-admin side — see that component's own header for
          why this was previously referenced but never built. --- */}
      <VaultWipeGraceModal showToast={showToast} />
    </section>
  );
}