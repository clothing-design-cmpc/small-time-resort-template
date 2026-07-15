/**
 * FILE: services/activityArchive.js
 * ROLE: Super-admin — background archival service, called from
 *       app/api/admin/activity-feed/route.js on every fetch
 *
 * PURPOSE:
 * The Activity Feed page shows a live-merged, paginated view of
 * VisitorLog + AccountActivityLog (10 rows/page). Once the combined
 * row count reaches 100 pages (1000 rows), this service:
 *   1. Snapshots every VisitorLog + AccountActivityLog row currently
 *      in the DB, by id — so nothing written after the snapshot gets
 *      swept up by accident
 *   2. Builds a plain-SQL INSERT dump of exactly that snapshot
 *   3. Uploads the dump to Google Drive (services/googleDrive.js)
 *   4. Deletes ONLY the snapshotted rows from both tables
 *   5. Writes one ActivityArchiveLog row so the Activity Feed page can
 *      show a "just archived" banner + Open in Google Drive button
 *
 * WHY SNAPSHOT-BY-ID INSTEAD OF "DELETE EVERYTHING OLDER THAN NOW":
 * New visitor/staff activity can be written between the snapshot read
 * and the delete. Snapshotting the exact id list first and deleting
 * WHERE id IN (...) guarantees we only ever delete what was actually
 * exported — never a row that arrived mid-archive.
 *
 * WHY UPLOAD HAPPENS BEFORE DELETE:
 * If the Google Drive upload throws, execution stops before any
 * prisma.deleteMany() call runs — the records simply stay in the DB
 * and the next Activity Feed page load retries the whole archive from
 * scratch. There is no path where records can be deleted without a
 * confirmed, already-uploaded copy existing on Drive first.
 *
 * DATA FLOW:
 * 1. app/api/admin/activity-feed/route.js calls
 *    archiveActivityFeedIfThresholdReached() after computing totalCount
 * 2. If totalCount < ARCHIVE_THRESHOLD_ROWS, this returns null immediately
 * 3. Otherwise it runs the steps above and returns the new
 *    ActivityArchiveLog row, which the route attaches to its response
 *    as `archiveNotice` for the client to render
 */
import { prisma } from "@/services/prisma";
import { uploadToDrive } from "@/services/googleDrive";

const PAGE_SIZE = 10;
const ARCHIVE_THRESHOLD_PAGES = 100;
const ARCHIVE_THRESHOLD_ROWS = PAGE_SIZE * ARCHIVE_THRESHOLD_PAGES; // 1000

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Escapes a single value for use inside a plain-SQL INSERT statement. */
function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Builds one INSERT statement covering every row for a single table. */
function buildInsertStatement(tableName, columns, rows) {
  if (rows.length === 0) return "";
  const valueLines = rows.map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(", ")})`);
  return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES\n${valueLines.join(",\n")};\n\n`;
}

/**
 * buildArchiveFileName
 * "JulyToAugust-activityfeed-2026.sql" style name, derived from the
 * oldest and newest createdAt timestamps actually in the snapshot —
 * never a static string, so the file name always matches its contents.
 */
function buildArchiveFileName(oldestDate, newestDate) {
  const startMonth = MONTH_NAMES[oldestDate.getUTCMonth()];
  const endMonth = MONTH_NAMES[newestDate.getUTCMonth()];
  const year = newestDate.getUTCFullYear();
  const monthLabel = startMonth === endMonth ? startMonth : `${startMonth}To${endMonth}`;
  return `${monthLabel}-activityfeed-${year}.sql`;
}

/**
 * archiveActivityFeedIfThresholdReached
 * Entry point called from the Activity Feed GET route. Safe to call on
 * every page load — it no-ops (two cheap COUNT queries) unless the
 * 100-page threshold has actually been reached.
 */
export async function archiveActivityFeedIfThresholdReached() {
  const [visitorCount, staffCount] = await Promise.all([
    prisma.visitorLog.count(),
    prisma.accountActivityLog.count(),
  ]);

  if (visitorCount + staffCount < ARCHIVE_THRESHOLD_ROWS) {
    return null;
  }

  // Snapshot every row currently in both tables — this exact set is
  // what gets exported AND what gets deleted, nothing added later.
  const [visitorRows, staffRows] = await Promise.all([
    prisma.visitorLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.accountActivityLog.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  if (visitorRows.length === 0 && staffRows.length === 0) {
    return null;
  }

  const allTimestamps = [...visitorRows, ...staffRows].map((row) => row.createdAt.getTime());
  const oldestDate = new Date(Math.min(...allTimestamps));
  const newestDate = new Date(Math.max(...allTimestamps));
  const fileName = buildArchiveFileName(oldestDate, newestDate);

  const visitorSql = buildInsertStatement(
    "visitor_logs",
    ["id", "ip_address", "user_agent", "path", "action", "details", "city", "country", "created_at"],
    visitorRows.map((row) => ({
      id: row.id,
      ip_address: row.ipAddress,
      user_agent: row.userAgent,
      path: row.path,
      action: row.action,
      details: row.details,
      city: row.city,
      country: row.country,
      created_at: row.createdAt,
    }))
  );

  const staffSql = buildInsertStatement(
    "account_activity_logs",
    ["id", "account_id", "action", "ip_address", "geo_city", "geo_country", "device_type", "user_agent", "created_at"],
    staffRows.map((row) => ({
      id: row.id,
      account_id: row.accountId,
      action: row.action,
      ip_address: row.ipAddress,
      geo_city: row.geoCity,
      geo_country: row.geoCountry,
      device_type: row.deviceType,
      user_agent: row.userAgent,
      created_at: row.createdAt,
    }))
  );

  const header =
    `-- Villa Azure Resort — Activity Feed Archive\n` +
    `-- Generated: ${new Date().toISOString()}\n` +
    `-- Range: ${oldestDate.toISOString()} to ${newestDate.toISOString()}\n` +
    `-- Rows: ${visitorRows.length} visitor_logs, ${staffRows.length} account_activity_logs\n\n`;

  const sqlDump = header + visitorSql + staffSql;
  const fileBuffer = Buffer.from(sqlDump, "utf-8");

  // Upload BEFORE deleting anything — if this throws, nothing below
  // runs and the records stay safely in the DB for the next retry.
  const { fileId, viewLink } = await uploadToDrive(fileName, fileBuffer, "application/sql");

  const visitorIds = visitorRows.map((row) => row.id);
  const staffIds = staffRows.map((row) => row.id);

  // Delete only the exact ids that were just exported — a single
  // transaction so both tables clear together or neither does.
  await prisma.$transaction([
    prisma.visitorLog.deleteMany({ where: { id: { in: visitorIds } } }),
    prisma.accountActivityLog.deleteMany({ where: { id: { in: staffIds } } }),
  ]);

  return prisma.activityArchiveLog.create({
    data: {
      fileName,
      driveFileId: fileId,
      driveViewLink: viewLink,
      recordCount: visitorRows.length + staffRows.length,
      rangeStart: oldestDate,
      rangeEnd: newestDate,
    },
  });
}
