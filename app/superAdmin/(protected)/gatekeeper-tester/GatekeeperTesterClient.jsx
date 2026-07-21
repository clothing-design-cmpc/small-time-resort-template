/**
 * FILE: app/superAdmin/(protected)/gatekeeper-tester/GatekeeperTesterClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Lets a super-admin dry-run Gatekeeper 1 (login brute force) and
 * Gatekeeper 2 (booking SQL injection) against THIS deployment,
 * straight from the browser — no terminal, no local setup. Wraps
 * POST /api/superAdmin/gatekeeper-tester, which delegates the actual
 * work to services/gatekeeperTester.js.
 *
 * The two test IPs are editable (default: reserved RFC 5737 test-net
 * addresses) so an admin can rehearse the exact response for a
 * specific IP if needed — the API route flags (never blocks) any IP
 * outside the reserved ranges as a warning.
 *
 * Gatekeeper 3 (anomalous admin login) is NOT covered here — it needs
 * a real prior login history and a genuinely different device/location
 * to trigger honestly, which isn't something a repeatable dry run
 * should fake. See docs/gatekeeper-testing.md for the manual walkthrough.
 *
 * DATA FLOW:
 * 1. Admin edits Test IP 1 / Test IP 2 (or leaves the defaults)
 * 2. "Run Dry Run" opens the confirmation modal (this deliberately
 *    trips real breach detectors on THIS deployment)
 * 3. Confirm -> POST /api/superAdmin/gatekeeper-tester
 * 4. Results render as a pass/fail checklist; any warnings from the
 *    API (e.g. a non-reserved test IP) show above the results
 */
"use client";

import { useState } from "react";
import axios from "axios";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";

const DEFAULT_TEST_IP_1 = "203.0.113.11";
const DEFAULT_TEST_IP_2 = "203.0.113.22";

export default function GatekeeperTesterClient() {
  const { toasts, showToast, dismissToast } = useToast();

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
   */
  async function handleRunDryRun() {
    setIsRunning(true);
    try {
      const response = await axios.post("/api/superAdmin/gatekeeper-tester", { testIp1, testIp2 });
      const data = response.data;

      setResult(data.data);
      showToast(data.message, data.data?.allPassed ? "success" : "warning");
      (data.data?.warnings ?? []).forEach((warning) => showToast(warning, "warning"));
    } catch (error) {
      const message = error.response?.data?.message ?? "The dry run couldn't complete. Please try again.";
      showToast(message, "error");
    } finally {
      setIsRunning(false);
      setIsModalOpen(false);
    }
  }

  return (
    <section className="gatekeeperTesterSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="gatekeeperTesterHeaderRow">
        <span className="gatekeeperTesterEyebrow">Security</span>
        <h1 className="gatekeeperTesterTitle">Gatekeeper Tester</h1>
        <p className="gatekeeperTesterSubtitle">
          Dry-runs Gatekeeper 1 (login brute force) and Gatekeeper 2 (booking SQL injection) against this
          deployment, right from the browser. Every test row is cleaned up automatically afterward — see{" "}
          <code>services/gatekeeperTester.js</code> for exactly what runs.
        </p>
      </div>

      <div className="gatekeeperTesterWarningBanner">
        Never run this against a deployment real visitors are actively using — it deliberately trips real breach
        detectors and briefly locks the site down while it runs.
      </div>

      <div className="gatekeeperTesterCard">
        <div className="gatekeeperTesterFieldRow">
          <label className="gatekeeperTesterLabel" htmlFor="testIp1Input">
            Test IP 1 <span className="gatekeeperTesterFieldHint">(Gatekeeper 1 — login brute force)</span>
          </label>
          <input
            id="testIp1Input"
            className="gatekeeperTesterInput"
            type="text"
            value={testIp1}
            onChange={(event) => setTestIp1(event.target.value)}
            disabled={isRunning}
            spellCheck={false}
          />
        </div>

        <div className="gatekeeperTesterFieldRow">
          <label className="gatekeeperTesterLabel" htmlFor="testIp2Input">
            Test IP 2 <span className="gatekeeperTesterFieldHint">(Gatekeeper 2 — booking SQL injection)</span>
          </label>
          <input
            id="testIp2Input"
            className="gatekeeperTesterInput"
            type="text"
            value={testIp2}
            onChange={(event) => setTestIp2(event.target.value)}
            disabled={isRunning}
            spellCheck={false}
          />
        </div>

        <p className="gatekeeperTesterFieldNote">
          Defaults are reserved for documentation/testing (RFC 5737 TEST-NET-3) — safe to leave as-is. Using a
          different IP is fine too; just make sure it isn't a real visitor's.
        </p>

        <button
          type="button"
          className="gatekeeperTesterRunButton"
          onClick={() => setIsModalOpen(true)}
          disabled={isRunning}
        >
          {isRunning ? "Running…" : "Run Dry Run"}
        </button>
      </div>

      {result && (
        <div className="gatekeeperTesterResultsCard">
          <div className="gatekeeperTesterResultsHeader">
            <h2 className="gatekeeperTesterResultsTitle">Results</h2>
            <span
              className={
                result.allPassed ? "gatekeeperTesterResultsSummaryPass" : "gatekeeperTesterResultsSummaryFail"
              }
            >
              {result.passedCount}/{result.totalCount} passed
            </span>
          </div>

          <ul className="gatekeeperTesterChecklist">
            {result.checks.map((check) => (
              <li key={check.name} className="gatekeeperTesterChecklistItem">
                <span className={check.passed ? "gatekeeperTesterPillPass" : "gatekeeperTesterPillFail"}>
                  {check.passed ? "Pass" : "Fail"}
                </span>
                <span className="gatekeeperTesterChecklistText">
                  {check.name}
                  {check.detail && <span className="gatekeeperTesterChecklistDetail"> — {check.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="gatekeeperTesterDocsNote">
        Gatekeeper 3 (anomalous admin login) isn't covered by this dry run — it needs a real prior login history
        and a genuinely different device/location to trigger honestly. See{" "}
        <code>docs/gatekeeper-testing.md</code> for the manual walkthrough.
      </p>

      <ConfirmationModal
        isOpen={isModalOpen}
        title="Run Gatekeeper Dry Run?"
        description={`This will send real login brute-force and SQL injection attempts to this deployment using ${testIp1} and ${testIp2}. The site will briefly enter breach lockdown as a result — everything is cleaned up automatically when the run finishes.`}
        confirmLabel="Run Dry Run"
        onConfirm={handleRunDryRun}
        onCancel={() => setIsModalOpen(false)}
      />
    </section>
  );
}
