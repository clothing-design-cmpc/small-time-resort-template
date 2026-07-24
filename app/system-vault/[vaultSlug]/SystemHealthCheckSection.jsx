/**
 * FILE: app/system-vault/[vaultSlug]/SystemHealthCheckSection.jsx
 * ROLE: Rendered inside RecoveryClient.jsx only
 *
 * PURPOSE:
 * "System Health Check" card. On demand (never on mount), fetches
 * GET /api/admin/system-health and renders three results: database
 * connectivity, whether the core tables (Bookings, Rooms, System
 * Settings) are reachable, and any double-booking conflicts found —
 * two active bookings on the same room with overlapping dates. See
 * services/systemHealthCheck.js for the full check logic. This is the
 * dashboard-wired counterpart to scripts/checkSystemHealth.js, which
 * runs the exact same checks from the terminal for a developer who
 * has no dashboard access at all — just a working .env file.
 *
 * DATA FLOW:
 * 1. Owner clicks "Run System Health Check"
 * 2. GET /api/admin/system-health (vault-session only)
 * 3. A 401 means the vault session expired mid-visit — same handling
 *    as every other GET in RecoveryClient.jsx: back to this slug's
 *    own /login screen
 * 4. Result renders as a connectivity badge, a per-table reachability
 *    list, and — only if any exist — a list of double-booking
 *    conflicts naming both guests and both date ranges involved
 */
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import "./SystemHealthCheckSection.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

export default function SystemHealthCheckSection({ showToast }) {
  const router = useRouter();
  const { vaultSlug } = useParams();

  const [result, setResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  async function handleRunCheck() {
    setIsChecking(true);
    try {
      const response = await axios.get("/api/admin/system-health");
      setResult(response.data.data);
    } catch (error) {
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      showToast("✕ Couldn't run the system health check.", "error");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="recoveryStepCard">
      <h2>System Health Check</h2>
      <p>
        Confirms the database is reachable, that the core tables (Bookings, Rooms, System Settings)
        can actually be read, and scans every active booking for double-booking conflicts — two
        guests booked into the same room on overlapping dates.
      </p>

      <button type="button" className="recoveryUnbanButton" onClick={handleRunCheck} disabled={isChecking}>
        {isChecking ? "Checking…" : "Run System Health Check"}
      </button>

      {result && (
        <div className="systemHealthResults">
          <p className="recoveryMutedText">
            Last checked {new Date(result.checkedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
            {" — "}
            <StatusBadge status={result.overallStatus === "ok" ? "success" : "failed"} />
          </p>

          {/* --- Connectivity --- */}
          <div className="systemHealthGroup">
            <div className="systemHealthGroupHeader">
              <span>Database Connectivity</span>
              <StatusBadge status={result.connectivity.status === "ok" ? "success" : "failed"} />
            </div>
            <p className="recoveryMutedText">{result.connectivity.message}</p>
          </div>

          {/* --- Core tables --- */}
          {result.coreTables.length > 0 && (
            <div className="systemHealthGroup">
              <div className="systemHealthGroupHeader">
                <span>Core Tables</span>
              </div>
              <ul className="systemHealthItemList">
                {result.coreTables.map((table) => (
                  <li key={table.label}>
                    <span>{table.label}</span>
                    <StatusBadge status={table.status === "ok" ? "success" : "failed"} />
                    {table.status === "ok" ? (
                      <span className="recoveryMutedText">{table.rowCount} row(s)</span>
                    ) : (
                      <span className="recoveryMutedText">{table.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* --- Double-booking conflicts --- */}
          <div className="systemHealthGroup">
            <div className="systemHealthGroupHeader">
              <span>Double-Booking Check</span>
              <StatusBadge status={result.doubleBookings.length === 0 ? "success" : "failed"} />
            </div>
            {result.doubleBookings.length === 0 ? (
              <p className="recoveryMutedText">No overlapping bookings found.</p>
            ) : (
              <ul className="systemHealthConflictList">
                {result.doubleBookings.map((conflict) => (
                  <li key={`${conflict.bookingAId}-${conflict.bookingBId}`}>
                    <span className="systemHealthConflictRoom">{conflict.roomName}</span>
                    <span className="recoveryMutedText">
                      {conflict.bookingAGuest} ({DATE_FORMATTER.format(new Date(conflict.checkInDateA))} –{" "}
                      {DATE_FORMATTER.format(new Date(conflict.checkOutDateA))}) overlaps with{" "}
                      {conflict.bookingBGuest} ({DATE_FORMATTER.format(new Date(conflict.checkInDateB))} –{" "}
                      {DATE_FORMATTER.format(new Date(conflict.checkOutDateB))})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
