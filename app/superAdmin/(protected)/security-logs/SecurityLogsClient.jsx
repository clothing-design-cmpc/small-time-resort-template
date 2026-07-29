/**
 * FILE: app/superAdmin/(protected)/security-logs/SecurityLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the append-only SecurityLog table: login attempts (success/
 * failed), denied admin access, rate limit hits, sensitive admin
 * actions, and automated retention purges — enriched with device type,
 * browser/OS, geolocation, and anomaly detection (new device /
 * impossible travel) — so an admin reviewing a possible break-in can
 * see exactly what happened, from where, on what device, and when.
 *
 * DATA FLOW:
 * 1. On mount and whenever page/eventType/deviceType/country filter
 *    changes, fetches GET /api/admin/security-logs?page=&eventType=&deviceType=&country=
 * 2. Once on mount (independent of the table filters — it always
 *    reflects full log history), fetches GET
 *    /api/admin/security-logs/geo-summary for the Geo Heatmap and to
 *    populate the Country filter's option list
 * 3. Export CSV/JSON buttons link straight to
 *    /api/admin/security-logs/export with the currently active filters
 *    — a real browser navigation (not fetch), so the file download
 *    prompt is handled natively
 * 4. DataTable renders the rows with its own built-in loading/empty/
 *    error states and pagination footer
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import SecurityGeoHeatmap from "@/components/superAdmin/SecurityGeoHeatmap";
import "./SecurityLogs.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Used inside the expanded row detail panel — includes seconds and the
// UTC offset so a full timestamp is unambiguous during incident review.
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "long",
});

/**
 * isLocalOrPrivateIp
 * True for loopback (::1, 127.0.0.1) and private-network addresses,
 * where a public whois lookup — and a geolocation lookup — is
 * meaningless. These only ever show up in local dev or behind an
 * internal proxy, never a real visitor.
 */
function isLocalOrPrivateIp(ip) {
  return (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("::ffff:127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

const EVENT_TYPE_FILTERS = [
  { value: "all", label: "All events" },
  { value: "login_success", label: "Login Success" },
  { value: "login_failed", label: "Login Failed" },
  { value: "admin_login_denied", label: "Access Denied" },
  { value: "rate_limit_hit", label: "Rate Limited" },
  { value: "admin_action", label: "Admin Action" },
  { value: "directions_verified", label: "Directions Verified" },
  { value: "directions_accessed", label: "Directions Accessed" },
  { value: "directions_denied_early", label: "Directions Denied (Early)" },
  { value: "directions_reuse_blocked", label: "Directions Reuse Blocked" },
  { value: "sql_injection_attempt", label: "SQLi Attempt" },
  { value: "system_retention_purge", label: "Retention Purge" },
  { value: "vault_login_success", label: "Vault Unlocked" },
  { value: "vault_login_failed", label: "Vault Login Failed" },
];

const DEVICE_TYPE_FILTERS = [
  { value: "all", label: "All devices" },
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
  { value: "bot", label: "Bot / Crawler" },
  { value: "unknown", label: "Unknown" },
];

const columns = [
  { key: "eventType", label: "Event" },
  { key: "actor", label: "Actor" },
  { key: "ipAddress", label: "IP Address", mono: true },
  { key: "device", label: "Device" },
  { key: "location", label: "Location" },
  { key: "createdAt", label: "When", mono: true },
];

/** Builds a human-readable "Browser on OS" string, or "Unknown device" when nothing was parsed. */
function formatDeviceLabel(log) {
  const browser = log.browserName && log.browserName !== "unknown" ? log.browserName : null;
  const os = log.osName && log.osName !== "unknown" ? log.osName : null;
  if (!browser && !os) return "Unknown device";
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

/** Builds a human-readable "City, Country" string, or null when geolocation didn't resolve. */
function formatLocationLabel(log) {
  if (isLocalOrPrivateIp(log.ipAddress ?? "")) return "This device";
  if (!log.country) return null;
  return log.city ? `${log.city}, ${log.country}` : log.country;
}

export default function SecurityLogsClient() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [deviceTypeFilter, setDeviceTypeFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Geo summary powers both the heatmap and the Country filter's option
  // list — fetched once on mount, independent of the table's own
  // filters/pagination (it always reflects the full log history).
  const [geoSummary, setGeoSummary] = useState({ heatmap: [], countries: [] });
  const [isGeoLoading, setIsGeoLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        eventType: eventTypeFilter,
        deviceType: deviceTypeFilter,
        country: countryFilter,
      });
      const response = await fetch(`/api/admin/security-logs?${params.toString()}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load security logs. Please try again.");
        return;
      }

      setLogs(result.data.logs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, eventTypeFilter, deviceTypeFilter, countryFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Runs once — the heatmap and Country dropdown reflect the whole
  // table's history, not just whatever page/filters are active.
  useEffect(() => {
    async function fetchGeoSummary() {
      setIsGeoLoading(true);
      try {
        const response = await fetch("/api/admin/security-logs/geo-summary");
        const result = await response.json();
        if (result.success) setGeoSummary(result.data);
      } catch {
        // Heatmap simply stays empty on failure — it's a supporting
        // visual, not something worth blocking or erroring the page over.
      } finally {
        setIsGeoLoading(false);
      }
    }
    fetchGeoSummary();
  }, []);

  // Changing any filter always jumps back to page 1 — staying on, say,
  // page 4 of a filtered-down list would usually just show an empty page.
  function handleEventTypeChange(nextFilter) {
    setEventTypeFilter(nextFilter);
    setPage(1);
  }
  function handleDeviceTypeChange(event) {
    setDeviceTypeFilter(event.target.value);
    setPage(1);
  }
  function handleCountryChange(event) {
    setCountryFilter(event.target.value);
    setPage(1);
  }

  /**
   * buildExportUrl
   * Carries the three active filters over to the export route so
   * "Export CSV" downloads exactly what the admin is currently looking
   * at, not the entire unfiltered table.
   */
  function buildExportUrl(format) {
    const params = new URLSearchParams({
      format,
      eventType: eventTypeFilter,
      deviceType: deviceTypeFilter,
      country: countryFilter,
    });
    return `/api/admin/security-logs/export?${params.toString()}`;
  }

  const rows = logs.map((log) => {
    const locationLabel = formatLocationLabel(log);
    return {
      id: log.id,
      eventType: (
        <span className="securityLogsEventCell">
          <StatusBadge status={log.eventType} />
          {log.isAnomalous && (
            <span className="securityLogsAnomalyIcon" title={log.anomalyReason ?? "Anomalous event"} aria-label="Anomalous event">
              ⚠
            </span>
          )}
        </span>
      ),
      actor: log.actor || "—",
      // Loopback/private addresses only ever show up in local dev or
      // behind an internal proxy (never a real visitor) — labeling them
      // "This device" instead of the raw "::1" makes it clear this is
      // expected dev behavior, not a bug, without hiding the real value
      // (still shown in the expanded row detail panel below).
      ipAddress: !log.ipAddress ? "—" : isLocalOrPrivateIp(log.ipAddress) ? "This device (::1)" : log.ipAddress,
      device: (
        <span className="securityLogsDeviceCell">
          <span className="securityLogsDeviceIcon" aria-hidden="true">
            {log.deviceType === "mobile" ? "📱" : log.deviceType === "tablet" ? "📟" : log.deviceType === "bot" ? "🤖" : "🖥️"}
          </span>
          {formatDeviceLabel(log)}
          {log.isNewDevice && <span className="securityLogsNewDeviceBadge">New</span>}
        </span>
      ),
      location: locationLabel ? (
        <span className="securityLogsLocationCell">
          <span className="securityLogsLocationIcon" aria-hidden="true">📍</span>
          {locationLabel}
        </span>
      ) : (
        <span className="securityLogsLocationCell securityLogsLocationCell--empty">Unknown</span>
      ),
      createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
      // Kept off the columns list so it never renders as its own cell —
      // only renderExpandedRow reads this, for the full-detail panel below.
      raw: log,
    };
  });

  /**
   * renderSecurityLogDetail
   * Expanded-row content for one Security Log entry: the full user-agent
   * string, device/OS breakdown, resolved geolocation, any anomaly
   * reason, and the exact timestamp down to the second.
   */
  function renderSecurityLogDetail(row) {
    const log = row.raw;
    const locationLabel = formatLocationLabel(log);
    return (
      <div className="securityLogDetailPanel">
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Event type</span>
          <span className="securityLogDetailValue adminMono">{log.eventType}</span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Actor</span>
          <span className="securityLogDetailValue">{log.actor || "— (not authenticated)"}</span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">IP address</span>
          <span className="securityLogDetailValue adminMono">
            {!log.ipAddress ? (
              "—"
            ) : isLocalOrPrivateIp(log.ipAddress) ? (
              <span>{log.ipAddress} (this device — no whois lookup available)</span>
            ) : (
              <a
                href={`https://whois.com/whois/${log.ipAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="securityLogDetailLink"
                onClick={(event) => event.stopPropagation()}
              >
                {log.ipAddress} ↗
              </a>
            )}
          </span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Timestamp</span>
          <span className="securityLogDetailValue adminMono">{FULL_DATE_FORMATTER.format(new Date(log.createdAt))}</span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Device</span>
          <span className="securityLogDetailValue">
            {formatDeviceLabel(log)} ({log.deviceType ?? "unknown"})
            {log.isNewDevice && <span className="securityLogsNewDeviceBadge" style={{ marginLeft: "0.5rem" }}>New device</span>}
          </span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Location</span>
          <span className="securityLogDetailValue">{locationLabel ?? "Unknown (geolocation didn't resolve)"}</span>
        </div>
        {log.isAnomalous && (
          <div className="securityLogDetailField securityLogDetailField--full">
            <span className="securityLogDetailLabel">Anomaly detected</span>
            <span className="securityLogDetailValue securityLogDetailValue--wrap securityLogDetailValue--anomaly">
              {log.anomalyReason || "Flagged as anomalous."}
            </span>
          </div>
        )}
        <div className="securityLogDetailField securityLogDetailField--full">
          <span className="securityLogDetailLabel">Full user-agent string</span>
          <span className="securityLogDetailValue securityLogDetailValue--wrap adminMono">
            {log.userAgent || "— (not recorded)"}
          </span>
        </div>
        <div className="securityLogDetailField securityLogDetailField--full">
          <span className="securityLogDetailLabel">Full details</span>
          <span className="securityLogDetailValue securityLogDetailValue--wrap">{log.details || "—"}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="securityLogsSection">
      <div className="securityLogsHeaderRow">
        <span className="securityLogsEyebrow">Audit Trail</span>
        <h1 className="securityLogsTitle">Security Logs</h1>
        <p className="securityLogsSubtitle">
          Login attempts, denied admin access, rate limit hits, sensitive admin actions, and
          automated retention purges — with device, location, and anomaly detection — newest
          first.
        </p>
      </div>

      <SecurityGeoHeatmap data={geoSummary.heatmap} isLoading={isGeoLoading} />

      <div className="securityLogsToolbar">
        <div className="securityLogsFilterRow">
          {EVENT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`securityLogsFilterPill${eventTypeFilter === filter.value ? " securityLogsFilterPillActive" : ""}`}
              onClick={() => handleEventTypeChange(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="securityLogsSelectRow">
          <label className="securityLogsSelectLabel">
            Device type
            <select className="securityLogsSelect" value={deviceTypeFilter} onChange={handleDeviceTypeChange}>
              {DEVICE_TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="securityLogsSelectLabel">
            Country
            <select className="securityLogsSelect" value={countryFilter} onChange={handleCountryChange}>
              <option value="all">All countries</option>
              {geoSummary.countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>

          <div className="securityLogsExportGroup">
            <a className="securityLogsExportButton" href={buildExportUrl("csv")}>
              ⭳ Export CSV
            </a>
            <a className="securityLogsExportButton" href={buildExportUrl("json")}>
              ⭳ Export JSON
            </a>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No security events match these filters."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
        renderExpandedRow={renderSecurityLogDetail}
      />
    </section>
  );
}
