/**
 * FILE: app/api/admin/security-logs/export/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Exports the (optionally filtered) SecurityLog table as a downloadable
 * CSV or JSON file — for incident review, external audit, or compliance
 * requests that need the raw log data outside the admin UI.
 *
 * DATA FLOW:
 * 1. The Security Logs page's Export button links here with the
 *    currently active eventType/deviceType/country filters and the
 *    chosen ?format=csv|json
 * 2. requireSuperAdmin() checks the session — never protected by
 *    middleware.js (its matcher only covers page routes)
 * 3. Query runs unpaginated (capped at EXPORT_ROW_LIMIT) and the full
 *    result is written as one file — never streamed row-by-row, since
 *    security log exports are bounded, infrequent admin actions
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

// Hard ceiling on a single export — protects the DB and the admin's
// browser from an accidental "export everything" on a years-old table.
// Admins needing more should narrow the filters and export in batches.
const EXPORT_ROW_LIMIT = 10000;

const CSV_COLUMNS = [
  { key: "eventType", header: "Event Type" },
  { key: "actor", header: "Actor" },
  { key: "ipAddress", header: "IP Address" },
  { key: "deviceType", header: "Device Type" },
  { key: "browserName", header: "Browser" },
  { key: "osName", header: "OS" },
  { key: "isNewDevice", header: "New Device" },
  { key: "city", header: "City" },
  { key: "country", header: "Country" },
  { key: "isAnomalous", header: "Anomalous" },
  { key: "anomalyReason", header: "Anomaly Reason" },
  { key: "details", header: "Details" },
  { key: "createdAt", header: "Timestamp (UTC)" },
];

/**
 * escapeCsvField
 * Wraps a field in double quotes and escapes any embedded quotes
 * whenever it contains a comma, quote, or newline — the standard CSV
 * quoting rule. Without this, an actor name or details string
 * containing a comma would silently shift every column after it.
 */
function escapeCsvField(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * buildCsv
 * Converts the log rows into a full CSV document, header row first.
 */
function buildCsv(logs) {
  const headerRow = CSV_COLUMNS.map((col) => escapeCsvField(col.header)).join(",");
  const dataRows = logs.map((log) =>
    CSV_COLUMNS.map((col) => escapeCsvField(col.key === "createdAt" ? log.createdAt.toISOString() : log[col.key])).join(",")
  );
  return [headerRow, ...dataRows].join("\n");
}

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "json" ? "json" : "csv"; // CSV is the default
  const eventType = searchParams.get("eventType");
  const deviceType = searchParams.get("deviceType");
  const country = searchParams.get("country");

  try {
    const where = {};
    if (eventType && eventType !== "all") where.eventType = eventType;
    if (deviceType && deviceType !== "all") where.deviceType = deviceType;
    if (country && country !== "all") where.country = country;

    const logs = await prisma.securityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: EXPORT_ROW_LIMIT,
    });

    // Writes the export itself as an admin_action for the audit trail —
    // exporting security logs is a sensitive action in its own right
    // and should be traceable to the admin who requested it.
    const { logSecurityEvent } = await import("@/services/securityLog");
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Exported ${logs.length} security log row(s) as ${format.toUpperCase()}.`,
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `security-logs-${timestamp}.${format}`;

    if (format === "json") {
      return new NextResponse(JSON.stringify(logs, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    return new NextResponse(buildCsv(logs), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[api/admin/security-logs/export] Failed to export:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to export security logs. Please try again." },
      { status: 500 }
    );
  }
}
