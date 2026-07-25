/**
 * FILE: app/system-vault/[vaultSlug]/VaultGatekeeperTesterSection.jsx
 * ROLE: Standalone — rendered inside RecoveryClient.jsx only
 *
 * PURPOSE:
 * Lets whoever holds a valid vault session (passphrase + OTP) dry-run
 * Gatekeeper 1 (login brute force) and Gatekeeper 2 (booking SQL
 * injection) against THIS deployment, straight from the browser. This
 * used to be its own standalone hidden page with its own separate
 * passphrase (app/gatekeeper-vault/[gatekeeperSlug]) — moved in here
 * instead so there's only one hidden URL and one passphrase to manage,
 * not two. Wraps POST /api/admin/gatekeeper-tester, which delegates
 * the actual work to services/gatekeeperTester.js.
 *
 * DATA FLOW:
 * 1. Never fetched on mount — only runs when the vault-session admin
 *    edits the test IPs (or leaves the defaults) and clicks "Run Dry
 *    Run", same read-only-until-clicked pattern
 *    VaultRecoveryChannelsSection.jsx uses
 * 2. Confirmation modal warns this trips real breach detectors on THIS
 *    deployment before it actually runs
 * 3. POST /api/admin/gatekeeper-tester (vault-session only)
 * 4. A 401 means the vault session expired mid-visit — same redirect
 *    every other call on this page already falls back to
 *
 * TOASTS: showToast is passed down as a prop, same pattern
 * VaultDangerZoneSection.jsx and VaultRecoveryChannelsSection.jsx
 * already use for their own actions.
 */
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import "./VaultGatekeeperTesterSection.css";

const DEFAULT_TEST_IP_1 = "203.0.113.11";
const DEFAULT_TEST_IP_2 = "203.0.113.22";

export default function VaultGatekeeperTesterSection({ showToast }) {
  const router = useRouter();
  const { vaultSlug } = useParams();

  const [testIp1, setTestIp1] = useState(DEFAULT_TEST_IP_1);
  const [testIp2, setTestIp2] = useState(DEFAULT_TEST_IP_2);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);

  /**
   * handleRunDryRun
   * Fires the dry run against this deployment's own origin. The
   * confirmation modal already warned the admin this trips real
   * breach detectors, so this just runs it and surfaces the result.
   * A 401 means the vault session expired mid-visit — same redirect
   * every other gated call on this page falls back to.
   */
  async function handleRunDryRun() {
    setIsRunning(true);
    try {
      const response = await axios.post("/api/admin/gatekeeper-tester", { testIp1, testIp2 });
      const data = response.data;

      setResult(data.data);
      showToast(data.message, data.data?.allPassed ? "success" : "warning");
      (data.data?.warnings ?? []).forEach((warning) => showToast(warning, "warning"));
    } catch (error) {
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      const message = error.response?.data?.message ?? "The dry run couldn't complete. Please try again.";
      showToast(message, "error");
    } finally {
      setIsRunning(false);
      setIsModalOpen(false);
    }
  }

  return (
    <div className="recoveryStepCard">
      <h2>Gatekeeper Tester</h2>
      <p>
        Dry-runs Gatekeeper 1 (login brute force) and Gatekeeper 2 (booking SQL injection) against this
        deployment, right from the browser. Test rows are <strong>not</strong> cleaned up automatically — see{" "}
        <code>services/gatekeeperTester.js</code> for exactly what runs and why they're left in place.
      </p>

      <p className="vaultGatekeeperTesterWarningBanner">
        Never run this against a deployment real visitors are actively using — it deliberately trips real
        breach detectors and briefly locks the site down while it runs.
      </p>

      <ol className="vaultGatekeeperTesterHowToList">
        <li>Run this only on staging, or on production during a scheduled maintenance window — never while real visitors are on the site.</li>
        <li>Leave Test IP 1 and Test IP 2 as the reserved defaults below, unless you specifically need to rehearse the response for a real IP.</li>
        <li>Click &quot;Run Dry Run&quot; and confirm the warning modal — this is your last chance to back out before it trips the site&apos;s real breach detectors.</li>
        <li>Wait for the checklist to finish. Every check should show <span className="vaultGatekeeperTesterPillPass">Pass</span> — a <span className="vaultGatekeeperTesterPillFail">Fail</span> means that part of the breach response isn&apos;t working and needs to be fixed before relying on it.</li>
        <li>Test rows are <strong>not</strong> cleaned up automatically — the test IPs stay blocked (visible on the Unban IP list above) until you manually unban them.</li>
        <li>This dry run does not cover Gatekeeper 3 (anomalous admin login) — see the &quot;Gatekeeper 3 Live Test&quot; section below, which needs a real QA admin login instead of a fake one.</li>
      </ol>

      <div className="vaultGatekeeperTesterFieldRow">
        <label className="vaultGatekeeperTesterLabel" htmlFor="testIp1Input">
          Test IP 1 <span className="vaultGatekeeperTesterFieldHint">(Gatekeeper 1 — login brute force)</span>
        </label>
        <input
          id="testIp1Input"
          className="vaultGatekeeperTesterInput"
          type="text"
          value={testIp1}
          onChange={(event) => setTestIp1(event.target.value)}
          disabled={isRunning}
          spellCheck={false}
        />
      </div>

      <div className="vaultGatekeeperTesterFieldRow">
        <label className="vaultGatekeeperTesterLabel" htmlFor="testIp2Input">
          Test IP 2 <span className="vaultGatekeeperTesterFieldHint">(Gatekeeper 2 — booking SQL injection)</span>
        </label>
        <input
          id="testIp2Input"
          className="vaultGatekeeperTesterInput"
          type="text"
          value={testIp2}
          onChange={(event) => setTestIp2(event.target.value)}
          disabled={isRunning}
          spellCheck={false}
        />
      </div>

      <p className="recoveryMutedText">
        Defaults are reserved for documentation/testing (RFC 5737 TEST-NET-3) — safe to leave as-is.
      </p>

      <button
        type="button"
        className="vaultGatekeeperTesterRunButton"
        onClick={() => setIsModalOpen(true)}
        disabled={isRunning}
      >
        {isRunning ? "Running…" : "Run Dry Run"}
      </button>

      {result && (
        <ul className="recoveryImportHistory">
          {result.checks.map((check) => (
            <li key={check.name}>
              <span
                className={
                  check.passed ? "vaultGatekeeperTesterPillPass" : "vaultGatekeeperTesterPillFail"
                }
              >
                {check.passed ? "Pass" : "Fail"}
              </span>
              <span className="adminMono">
                {check.name}
                {check.detail && <span className="recoveryMutedText"> — {check.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="recoveryMutedText">
        Gatekeeper 3 (anomalous admin login) isn&apos;t covered by this dry run — see the &quot;Gatekeeper 3
        Live Test&quot; section below. It needs a real QA admin login (not a fake one) and is not a harmless
        dry run — read that section&apos;s warning before running it.
      </p>

      <ConfirmationModal
        isOpen={isModalOpen}
        title="Run Gatekeeper Dry Run?"
        description={`This will send real login brute-force and SQL injection attempts to this deployment using ${testIp1} and ${testIp2}. Both IPs will actually get blocked — the site itself stays up for everyone else. Test rows are not cleaned up automatically; they'll stay visible on the Unban IP list until you remove them yourself.`}
        confirmLabel="Run Dry Run"
        onConfirm={handleRunDryRun}
        onCancel={() => setIsModalOpen(false)}
      />
    </div>
  );
}