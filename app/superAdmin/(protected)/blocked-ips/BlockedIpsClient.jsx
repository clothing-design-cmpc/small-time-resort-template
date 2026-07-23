/**
 * FILE: app/superAdmin/(protected)/blocked-ips/BlockedIpsClient.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Read-only view of every row in BlockedIp — which IPs are blocked,
 * why, which gatekeeper tripped (if any), and when. Deliberately does
 * NOT include an "Unban" action here — see the API route's own header
 * for why lifting a block stays vault-only. This page exists purely so
 * any signed-in super-admin can quickly check whether their own IP (or
 * a guest's) is on the list without going through the vault's login
 * chain just to look.
 *
 * DATA FLOW:
 * 1. On mount and whenever page changes, fetches
 *    GET /api/superAdmin/blocked-ips?page={page}
 * 2. DataTable renders the rows with its own built-in loading/empty/
 *    error states and pagination footer
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import "./BlockedIps.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const columns = [
  { key: "ipAddress", label: "IP Address", mono: true },
  { key: "reason", label: "Reason" },
  { key: "gatekeeper", label: "Gatekeeper" },
  { key: "blockedBy", label: "Blocked By" },
  { key: "createdAt", label: "Blocked On", mono: true },
];

/** Human label for the gatekeeper column — a manual block has no gatekeeper number. */
function formatGatekeeperLabel(gatekeeper) {
  if (!gatekeeper) return "Manual block";
  return `Gatekeeper ${gatekeeper}`;
}

export default function BlockedIpsClient() {
  const [blockedIps, setBlockedIps] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchBlockedIps = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/superAdmin/blocked-ips?page=${page}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load blocked IPs. Please try again.");
        return;
      }

      setBlockedIps(result.data.blockedIps);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchBlockedIps();
  }, [fetchBlockedIps]);

  const rows = blockedIps.map((blocked) => ({
    id: blocked.id,
    ipAddress: blocked.ipAddress,
    reason: blocked.reason,
    gatekeeper: formatGatekeeperLabel(blocked.gatekeeper),
    blockedBy: blocked.blockedBy === "system" ? "System (auto)" : blocked.blockedBy,
    createdAt: DATE_FORMATTER.format(new Date(blocked.createdAt)),
  }));

  return (
    <section className="blockedIpsSection">
      <div className="blockedIpsHeaderRow">
        <span className="blockedIpsEyebrow">Security</span>
        <h1 className="blockedIpsTitle">Blocked IPs</h1>
        <p className="blockedIpsSubtitle">
          Every IP address currently blocked — automatically by a gatekeeper trip, or added manually.
          This list is read-only; unbanning an IP still requires the disaster-recovery vault's own
          verification code, not just this dashboard.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No IPs are currently blocked."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={25}
        onPageChange={setPage}
      />
    </section>
  );
}
