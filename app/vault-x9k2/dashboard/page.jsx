/**
 * FILE: app/vault-x9k2/dashboard/page.jsx
 * ROLE: Owner only — vault dashboard, protected by the vault_session cookie
 *
 * PURPOSE:
 * Shows the vault dashboard with an Unban section listing currently
 * banned devices/IPs. Clicking Unban on any entry opens a step-up TOTP
 * modal — a valid vault session alone is not enough to execute the
 * unban itself.
 *
 * DATA FLOW:
 * 1. On mount, fetch GET /api/vault/banned-devices
 * 2. Render list — loading / empty / error states all handled
 * 3. Click "Unban" -> opens StepUpTotpModal for that specific entry
 * 4. Modal submits POST /api/vault/unban with { bannedDeviceId, totpCode }
 * 5. On success, refresh the list and show a toast
 */
"use client";

import { useEffect, useState } from "react";
import StepUpTotpModal from "@/components/StepUpTotpModal";
import "../vault.css";
import "./dashboard.css";

export default function VaultDashboardPage() {
  const [bannedDevices, setBannedDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBan, setSelectedBan] = useState(null); // entry pending step-up confirmation
  const [toastMessage, setToastMessage] = useState("");

  /**
   * fetchBannedDevices
   * Loads the current Unban section list from the server. Runs on
   * mount and again after any successful unban.
   */
  async function fetchBannedDevices() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vault/banned-devices");
      const result = await response.json();
      if (!result.success) throw new Error(result.message);
      setBannedDevices(result.data);
    } catch {
      setError("Failed to load banned devices. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchBannedDevices();
  }, []);

  /**
   * handleUnbanConfirmed
   * Called by StepUpTotpModal after the owner enters a fresh TOTP code.
   * Executes the actual unban via the API, then refreshes the list.
   */
  async function handleUnbanConfirmed(totpCode) {
    const response = await fetch("/api/vault/unban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bannedDeviceId: selectedBan.id, totpCode }),
    });
    const result = await response.json();

    if (result.success) {
      setToastMessage("✓ Device unbanned successfully.");
      setSelectedBan(null);
      fetchBannedDevices();
    } else {
      setToastMessage(`✕ ${result.message}`);
    }

    setTimeout(() => setToastMessage(""), 2000);
  }

  return (
    <section className="dashboardSection">
      <div className="dashboardContainer">
        <span className="vaultEyebrow">Owner Vault</span>
        <h1 className="vaultTitle">Dashboard</h1>

        <section className="unbanSection">
          <div className="unbanSectionHeader">
            <h2>Banned Devices</h2>
            <p>Devices and IPs currently blocked from the super-admin login.</p>
          </div>

          {isLoading && <p className="unbanStatusText">Loading…</p>}
          {!isLoading && error && (
            <p className="unbanStatusText unbanErrorText">{error}</p>
          )}
          {!isLoading && !error && bannedDevices.length === 0 && (
            <p className="unbanStatusText">No devices are currently banned.</p>
          )}

          {!isLoading && !error && bannedDevices.length > 0 && (
            <ul className="banList">
              {bannedDevices.map((ban) => (
                <li key={ban.id} className="banCard">
                  <article>
                    <p className="banReason">{ban.banReason}</p>
                    <p className="banMeta">
                      {ban.browserName || "Unknown browser"} on {ban.osName || "Unknown OS"} ·{" "}
                      {ban.deviceType || "unknown device"}
                    </p>
                    <p className="banMeta">
                      {ban.geoCity ? `${ban.geoCity}, ` : ""}
                      {ban.geoCountry || "Unknown location"} · IP: {ban.ipAddress || "n/a"}
                    </p>
                    <p className="banMeta">
                      Banned: {new Date(ban.bannedAt).toLocaleString()}
                    </p>
                    <button className="unbanButton" onClick={() => setSelectedBan(ban)}>
                      Unban
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selectedBan && (
        <StepUpTotpModal
          title="Confirm Unban"
          description={`Enter your current authenticator code to unban this device (${
            selectedBan.browserName || "unknown browser"
          } · ${selectedBan.geoCity || "unknown location"}).`}
          onConfirm={handleUnbanConfirmed}
          onCancel={() => setSelectedBan(null)}
        />
      )}

      {toastMessage && <div className="vaultToast">{toastMessage}</div>}
    </section>
  );
}
