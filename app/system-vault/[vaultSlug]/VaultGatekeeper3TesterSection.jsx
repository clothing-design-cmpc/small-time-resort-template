/**
 * FILE: app/system-vault/[vaultSlug]/VaultGatekeeper3TesterSection.jsx
 * ROLE: Standalone — rendered inside RecoveryClient.jsx only, right
 *       after VaultGatekeeperTesterSection (GK1/GK2)
 *
 * PURPOSE:
 * Lets whoever holds a valid vault session live-test Gatekeeper 3
 * (anomalous admin login) against THIS deployment. Unlike GK1/GK2's
 * dry run, this is NOT harmless — it needs a real QA super-admin
 * login (credentials live server-side only, in .env.local — never
 * typed into this form) and, on success, actually locks the whole
 * site down and rotates the real vault passphrase. Nothing here
 * cleans that up automatically; the confirmation modal and the
 * post-run banner both say so.
 *
 * DATA FLOW:
 * 1. Never fetched on mount — only runs when the vault-session admin
 *    clicks "Run Live Test", same pattern as the GK1/GK2 tester.
 * 2. Confirmation modal spells out every real, lasting side effect
 *    before this actually runs.
 * 3. POST /api/admin/gatekeeper3-tester (vault-session only), which
 *    delegates to services/gatekeeper3Tester.js.
 * 4. A 401 means the vault session expired mid-visit — same redirect
 *    every other call on this page already falls back to.
 * 5. On completion, an unmissable reminder to use this same page's
 *    "End Lockdown" action (see the Active Incident section above)
 *    once done reviewing — this section does not do that for you.
 *
 * TOASTS: showToast is passed down as a prop, same pattern every
 * other section on this page already uses.
 */
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import "./VaultGatekeeperTesterSection.css";
import "./VaultGatekeeper3TesterSection.css";

const DEFAULT_TEST_IP = "203.0.113.33";

export default function VaultGatekeeper3TesterSection({ showToast }) {
  const router = useRouter();
  const { vaultSlug } = useParams();

  const [testIp, setTestIp] = useState(DEFAULT_TEST_IP);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);

  /**
   * handleRunLiveTest
   * Fires the live GK3 test against this deployment's own origin. The
   * confirmation modal already spelled out the real consequences, so
   * this just runs it and surfaces the result — including reminding
   * the admin that lockdown is now genuinely ON and stays on until
   * they end it manually.
   */
  async function handleRunLiveTest() {
    setIsRunning(true);
    try {
      const response = await axios.post("/api/admin/gatekeeper3-tester", { testIp });
      const data = response.data;

      setResult(data.data);
      showToast(data.message, data.data?.allPassed ? "success" : "warning");
      (data.data?.warnings ?? []).forEach((warning) => showToast(warning, "warning"));
    } catch (error) {
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      const message = error.response?.data?.message ?? "The test couldn't complete. Please try again.";
      showToast(message, "error");
    } finally {
      setIsRunning(false);
      setIsModalOpen(false);
    }
  }

  return (
    <div className="recoveryStepCard">
      <h2>Gatekeeper 3 Live Test</h2>
      <p>
        Live-tests Gatekeeper 3 (anomalous admin login) against this deployment by logging in twice with the
        same real QA admin account, simulating a new device the second time. See{" "}
        <code>services/gatekeeper3Tester.js</code> for exactly what runs.
      </p>

      <div className="vaultGatekeeper3TesterDangerBanner">
        <strong>This is not a harmless dry run</strong>
        Running this actually flips the whole site into breach lockdown, actually rotates the real vault
        passphrase (a new one is emailed to VAULT_OWNER_EMAIL), and actually dispatches a backup and a breach
        alert email. Nothing here reverts any of it automatically — you end the lockdown yourself using this
        page&apos;s &quot;End Lockdown&quot; action once you&apos;re done reviewing the results.
      </div>

      <div className="vaultGatekeeper3TesterConfigWarning">
        Requires <code>GATEKEEPER3_TEST_ADMIN_EMAIL</code> and <code>GATEKEEPER3_TEST_ADMIN_PASSWORD</code> to
        be set in <code>.env.local</code>, pointing at a dedicated QA super-admin account — never a real
        person&apos;s daily-use login. The test will fail cleanly with a clear message if these aren&apos;t
        configured.
      </div>

      <ol className="vaultGatekeeperTesterHowToList">
        <li>Run this only on staging, or on production during a scheduled maintenance window — never while real visitors are on the site.</li>
        <li>Confirm the QA admin credentials above are set before clicking run — this test cannot fake a valid login the way GK1/GK2 fake a wrong one.</li>
        <li>Click &quot;Run Live Test&quot; and read the confirmation modal — this is your last chance to back out.</li>
        <li>Wait for the checklist to finish. Every check should show <span className="vaultGatekeeperTesterPillPass">Pass</span> — a <span className="vaultGatekeeperTesterPillFail">Fail</span> means that part of GK3&apos;s response isn&apos;t working.</li>
        <li>The site is now genuinely locked down. Use the &quot;End Lockdown&quot; action in the Active Incident section above when you&apos;re done reviewing.</li>
        <li>&quot;Impossible travel&quot; (the other GK3 trigger) isn&apos;t covered here — it needs two real, differently-geolocated IPs to trigger honestly. See <code>docs/gatekeeper-testing.md</code> for that manual walkthrough.</li>
      </ol>

      <div className="vaultGatekeeperTesterFieldRow">
        <label className="vaultGatekeeperTesterLabel" htmlFor="testIp3Input">
          Test IP <span className="vaultGatekeeperTesterFieldHint">(same IP used for both simulated logins)</span>
        </label>
        <input
          id="testIp3Input"
          className="vaultGatekeeperTesterInput"
          type="text"
          value={testIp}
          onChange={(event) => setTestIp(event.target.value)}
          disabled={isRunning}
          spellCheck={false}
        />
      </div>

      <p className="recoveryMutedText">
        Default is reserved for documentation/testing (RFC 5737 TEST-NET-3) — safe to leave as-is. Both
        logins use this same IP; only the simulated device changes.
      </p>

      <button
        type="button"
        className="vaultGatekeeperTesterRunButton"
        onClick={() => setIsModalOpen(true)}
        disabled={isRunning}
      >
        {isRunning ? "Running…" : "Run Live Test"}
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

      <ConfirmationModal
        isOpen={isModalOpen}
        title="Run Gatekeeper 3 Live Test?"
        description={`This will log in twice with the real QA admin account using test IP ${testIp}, simulating a new device on the second login. If it works, the whole site will enter real breach lockdown, the real vault passphrase will be rotated, and a new one will be emailed to VAULT_OWNER_EMAIL. None of this reverts automatically — you must end the lockdown yourself afterward.`}
        confirmLabel="Run Live Test"
        onConfirm={handleRunLiveTest}
        onCancel={() => setIsModalOpen(false)}
      />
    </div>
  );
}
