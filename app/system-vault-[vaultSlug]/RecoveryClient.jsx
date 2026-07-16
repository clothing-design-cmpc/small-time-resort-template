/**
 * FILE: app/system-vault-[vaultSlug]/RecoveryClient.jsx
 * ROLE: Standalone — not gated by proxy.js or any super_admin session;
 *       reachable only after both vault factors (passphrase + emailed
 *       OTP) are satisfied, enforced by page.jsx's server-side redirect
 *       chain and re-checked by every /api/admin/breach call below.
 *
 * PURPOSE:
 * The actual recovery workflow: shows which gatekeeper tripped and
 * when, reuses the existing useSqlImport hook (same one the normal
 * Backups page uses) so importing the pre-breach Google Drive/R2 SQL
 * backup works identically here, and exposes an "End Lockdown" action
 * once the super-admin has confirmed the restore looks right.
 *
 * DATA FLOW:
 * 1. On mount, GET /api/admin/breach loads the active (unresolved)
 *    BreachEvent plus SystemSettings.breachLockdown
 * 2. Uploading a .sql/.sql.gz file goes through the same
 *    POST /api/admin/sql-import -> database-restore.yml pipeline the
 *    Backups page already uses — nothing new to build there
 * 3. "End Lockdown" PATCHes /api/admin/breach, which resolves the
 *    BreachEvent and flips breachLockdown + maintenanceMode off
 * 4. "Lock Vault" DELETEs /api/admin/vault-login, clearing the
 *    "vaultSession" cookie and sending the admin back to this same
 *    slug's own login screen without touching their regular
 *    super-admin session. A 401 from step 1's GET (vault session
 *    expired mid-visit, e.g. the 30-minute window ran out while this
 *    tab was open) does the same redirect automatically.
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
        router.push(`/system-vault-${vaultSlug}/login`);
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
  }, [fetchBreachStatus]);

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
      router.push(`/system-vault-${vaultSlug}/login`);
    }
  }

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
    </section>
  );
}
