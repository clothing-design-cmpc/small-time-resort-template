/**
 * FILE: app/system-vault/[vaultSlug]/EnvCheckerSection.jsx
 * ROLE: Rendered inside RecoveryClient.jsx only
 *
 * PURPOSE:
 * Task 3 — "Environment Check" card. On demand (never on mount — a
 * live DB query on every dashboard visit isn't worth it), fetches
 * GET /api/admin/env-check and renders a per-group pass/fail list:
 * which env vars are set (never their values), and the two live
 * checks (database connectivity, GeoIP file presence). This is the
 * dashboard-wired counterpart to system-vault-setup, which only ever
 * reads the single VAULT_SETUP_KEY value and isn't wired to anything
 * else — see services/envCheck.js for the full spec.
 *
 * DATA FLOW:
 * 1. Owner clicks "Run Environment Check"
 * 2. GET /api/admin/env-check (vault-session only)
 * 3. A 401 means the vault session expired mid-visit — same handling
 *    as every other GET in RecoveryClient.jsx: back to this slug's
 *    own /login screen
 * 4. Result renders as one collapsible group per service, each item
 *    showing a Set/Missing badge, plus the two live-check rows
 */
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import "./EnvCheckerSection.css";

export default function EnvCheckerSection({ showToast }) {
  const router = useRouter();
  const { vaultSlug } = useParams();

  const [result, setResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  async function handleRunCheck() {
    setIsChecking(true);
    try {
      const response = await axios.get("/api/admin/env-check");
      setResult(response.data.data);
    } catch (error) {
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      showToast("✕ Couldn't run the environment check.", "error");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="recoveryStepCard">
      <h2>Environment Check</h2>
      <p>
        Checks whether every .env key the app needs is actually set, and pings the database and GeoIP
        file to confirm they&apos;re really working — never reveals the values
        themselves. Also sends one real test email via EmailJS to confirm it can actually send,
        not just that the keys are set.
      </p>

      <button type="button" className="recoveryUnbanButton" onClick={handleRunCheck} disabled={isChecking}>
        {isChecking ? "Checking…" : "Run Environment Check"}
      </button>

      {result && (
        <div className="envCheckerResults">
          <p className="recoveryMutedText">
            Last checked {new Date(result.checkedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
            {" — "}
            <StatusBadge status={result.overallStatus === "ok" ? "success" : "failed"} />
          </p>

          {result.groups.map((group) => (
            <div key={group.id} className="envCheckerGroup">
              <div className="envCheckerGroupHeader">
                <span>{group.label}</span>
                <StatusBadge status={group.status === "ok" ? "success" : "failed"} />
              </div>

              <ul className="envCheckerItemList">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <span className="adminMono">{item.key}</span>
                    <StatusBadge status={item.present ? "success" : item.required ? "failed" : "pending"} />
                    {!item.present && !item.required && <span className="recoveryMutedText">optional</span>}
                  </li>
                ))}
              </ul>

              {group.liveCheck && (
                <>
                  <p className="recoveryMutedText">
                    Live check — <StatusBadge status={group.liveCheck.status === "ok" ? "success" : "failed"} />{" "}
                    {group.liveCheck.message}
                  </p>
                  {/* Always shown when present — e.g. GeoIP's refresh-every-2-weeks
                      note — never hidden behind the collapsed API Setup Guide card. */}
                  {group.liveCheck.reminder && (
                    <p className="envCheckerReminder">⚠ {group.liveCheck.reminder}</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
