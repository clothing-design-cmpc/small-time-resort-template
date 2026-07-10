/**
 * FILE: app/superAdmin/(protected)/security-logs/SecurityLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the append-only SecurityLog table: login attempts (success/
 * failed), denied admin access, rate limit hits, and sensitive admin
 * actions (e.g. booking cancellations) — enriched with device
 * fingerprinting and self-hosted GeoIP2 geolocation (Rule 38), so an
 * admin reviewing a possible break-in can see exactly what device, and
 * where in the world, an event came from — plus a Geo Heatmap and
 * CSV/JSON export for incident review outside the admin UI.
 *
 * DATA FLOW:
 * 1. On mount and whenever page/eventType/deviceType/country filter
 *    changes, fetches GET /api/admin/security-logs?page=...&eventType=...
 * 2. On mount only, fetches GET /api/admin/security-logs/geo-summary for
 *    the heatmap and the Country filter's dropdown options
 * 3. DataTable (components/superAdmin/DataTable) renders the rows with
 *    its own built-in loading/empty/error states and pagination footer
 * 4. The Export button navigates to /api/admin/security-logs/export
 *    with the currently active filters, which streams back a file —
 *    no client-side CSV/JSON generation needed
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Monitor, Smartphone, Tablet, Bot, HelpCircle, Download, AlertTriangle } from "lucide-react";
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

// Loopback addresses show up on every request made from the same
// machine the dev server is running on — normal in local development,
// but "::1" reads like a mistake to anyone not expecting it. Labeling
// it explicitly avoids that confusion without hiding the real value.
const LOOPBACK_ADDRESSES = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

/**
 * formatIpAddress
 * Appends a "(this device)" hint next to loopback addresses so the
 * table reads clearly instead of showing a bare "::1" with no context.
 * Every other IP address is shown exactly as recorded.
 */
function formatIpAddress(ipAddress) {
  if (!ipAddress) return "—";
  return LOOPBACK_ADDRESSES.has(ipAddress) ? `${ipAddress} (this device)` : ipAddress;
}

/**
 * DEVICE_TYPE_ICONS
 * Maps a SecurityLog.deviceType value to its Lucide icon component —
 * kept as a lookup rather than a switch so DeviceCell stays a one-liner.
 */
const DEVICE_TYPE_ICONS = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot,
  unknown: HelpCircle,
};

const EVENT_TYPE_FILTERS = [
  { value: "all", label: "All events" },
  { value: "login_success", label: "Login Success" },
  { value: "login_failed", label: "Login Failed" },
  { value: "admin_login_denied", label: "Access Denied" },
  { value: "rate_limit_hit", label: "Rate Limited" },
  { value: "admin_action", label: "Admin Action" },
  { value: "sql_injection_attempt", label: "SQLi Attempt" },
];

const DEVICE_TYPE_FILTERS = [
  { value: "all", label: "All devices" },
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
  { value: "bot", label: "Bot" },
  { value: "unknown", label: "Unknown" },
];

const columns = [
  { key: "eventType", label: "Event" },
  { key: "actor", label: "Actor" },
  { key: "ipAddress", label: "IP Address", mono: true },
  { key: "device", label: "Device" },
  { key: "location", label: "Location" },
  { key: "details", label: "Details" },
  { key: "createdAt", label: "When", mono: true },
];

/**
 * DeviceCell
 * Icon + "Browser on OS" label for the Device column — falls back to
 * a generic help icon and "Unknown device" when parsing (services/
 * deviceFingerprint.js) couldn't determine a type.
 */
function DeviceCell({ deviceType, browserName, osName, isNewDevice }) {
  const Icon = DEVICE_TYPE_ICONS[deviceType] ?? HelpCircle;
  const label =
    browserName && osName && browserName !== "unknown" && osName !== "unknown"
      ? `${browserName} on ${osName}`
      : "Unknown device";

  return (
    <span className="securityLogsDeviceCell">
      <Icon size={14} className="securityLogsDeviceIcon" aria-hidden="true" />
      {label}
      {isNewDevice && <span className="securityLogsNewDeviceBadge">New</span>}
    </span>
  );
}

/**
 * LocationCell
 * Pin icon + "City, Country" for the Location column — falls back to
 * an em dash when geolocation couldn't be resolved (private/loopback
 * IP, or the self-hosted MaxMind DB is unavailable).
 */
function LocationCell({ city, country }) {
  if (!country) return <span className="securityLogsLocationCell securityLogsLocationCell--empty">—</span>;
  return (
    <span className="securityLogsLocationCell">
      <MapPin size={14} className="securityLogsLocationIcon" aria-hidden="true" />
      {city ? `${city}, ${country}` : country}
    </span>
  );
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

  const [geoHeatmapData, setGeoHeatmapData] = useState([]);
  const [countryOptions, setCountryOptions] = useState([]);
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

  // Geo summary (heatmap + Country filter options) is independent of
  // the table's own filters — it always reflects the full log history
  // so the heatmap gives a stable overview rather than shifting every
  // time the admin narrows the table down.
  useEffect(() => {
    async function fetchGeoSummary() {
      setIsGeoLoading(true);
      try {
        const response = await fetch("/api/admin/security-logs/geo-summary");
        const result = await response.json();
        if (result.success) {
          setGeoHeatmapData(result.data.heatmap);
          setCountryOptions(result.data.countries);
        }
      } catch {
        // Heatmap is a supplementary view — a failed fetch here should
        // never block the main table, so it just stays empty.
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
   * handleExport
   * Builds the export URL with the currently active filters and opens
   * it in a new tab — the browser handles the file download from the
   * Content-Disposition header the API route sets, no client-side
   * CSV/JSON generation needed.
   */
  function handleExport(format) {
    const params = new URLSearchParams({
      format,
      eventType: eventTypeFilter,
      deviceType: deviceTypeFilter,
      country: countryFilter,
    });
    window.open(`/api/admin/security-logs/export?${params.toString()}`, "_blank");
  }

  const rows = logs.map((log) => ({
    id: log.id,
    eventType: (
      <span className="securityLogsEventCell">
        <StatusBadge status={log.eventType} />
        {log.isAnomalous && (
          <AlertTriangle size={14} className="securityLogsAnomalyIcon" aria-label="Anomalous event" />
        )}
      </span>
    ),
    actor: log.actor || "—",
    ipAddress: formatIpAddress(log.ipAddress),
    device: (
      <DeviceCell
        deviceType={log.deviceType}
        browserName={log.browserName}
        osName={log.osName}
        isNewDevice={log.isNewDevice}
      />
    ),
    location: <LocationCell city={log.city} country={log.country} />,
    details: log.details || "—",
    createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
    // Kept off the columns list so it never renders as its own cell —
    // only renderExpandedRow reads this, for the full-detail panel below.
    raw: log,
  }));

  /**
   * renderSecurityLogDetail
   * Expanded-row content for one Security Log entry: the full user-agent
   * string, device/OS breakdown, full geolocation, any anomaly reason,
   * the raw event type, IP with a whois lookup link, and the exact
   * timestamp down to the second.
   */
  function renderSecurityLogDetail(row) {
    const log = row.raw;
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
            ) : LOOPBACK_ADDRESSES.has(log.ipAddress) ? (
              // A whois lookup on a loopback address returns nothing
              // useful — it just means "this same machine," so it's
              // labeled directly instead of offering a dead-end link.
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
            {log.browserName && log.browserName !== "unknown" ? log.browserName : "Unknown browser"}
            {" on "}
            {log.osName && log.osName !== "unknown" ? log.osName : "unknown OS"}
            {" · "}
            {log.deviceType ?? "unknown"}
            {log.isNewDevice && <span className="securityLogsNewDeviceBadge">New device</span>}
          </span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Location</span>
          <span className="securityLogDetailValue">
            {log.country ? (log.city ? `${log.city}, ${log.country}` : log.country) : "— (not resolved)"}
          </span>
        </div>
        {log.isAnomalous && (
          <div className="securityLogDetailField securityLogDetailField--full">
            <span className="securityLogDetailLabel">Anomaly flagged</span>
            <span className="securityLogDetailValue securityLogDetailValue--wrap securityLogDetailValue--anomaly">
              {log.anomalyReason}
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
          Login attempts, denied admin access, rate limit hits, and sensitive admin actions —
          with device and location context, newest first.
        </p>
      </div>

      <SecurityGeoHeatmap data={geoHeatmapData} isLoading={isGeoLoading} />

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
            Device
            <select className="securityLogsSelect" value={deviceTypeFilter} onChange={handleDeviceTypeChange}>
              {DEVICE_TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="securityLogsSelectLabel">
            Country
            <select className="securityLogsSelect" value={countryFilter} onChange={handleCountryChange}>
              <option value="all">All countries</option>
              {countryOptions.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </label>

          <div className="securityLogsExportGroup">
            <button type="button" className="securityLogsExportButton" onClick={() => handleExport("csv")}>
              <Download size={14} aria-hidden="true" />
              Export CSV
            </button>
            <button type="button" className="securityLogsExportButton" onClick={() => handleExport("json")}>
              <Download size={14} aria-hidden="true" />
              Export JSON
            </button>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No security events recorded yet."
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
