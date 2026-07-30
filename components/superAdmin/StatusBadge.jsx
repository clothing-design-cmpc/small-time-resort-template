/**
 * FILE: components/superAdmin/StatusBadge.jsx
 * ROLE: Super-admin — shared UI, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Small colored pill indicating a user/order/system status (Active,
 * Suspended, Banned, Pending, Processing, Delivered, Failed), per the
 * design system's Status Badge component spec. Reused across every
 * future data table (Users, Orders, Support Tickets) — never rebuilt
 * per page.
 *
 * DATA FLOW:
 * 1. Consumer passes a `status` string matching one of STATUS_STYLES's keys
 * 2. Purely presentational — no fetching, no state
 */
import "./StatusBadge.css";

/* Background is always the tinted (22 alpha) version of the text color,
   per spec: "Always use background-color (light tint) + text color". */
const STATUS_STYLES = {
  active: { label: "Active", color: "#10b981" },
  inactive: { label: "Inactive", color: "#71717a" },
  suspended: { label: "Suspended", color: "#f59e0b" },
  banned: { label: "Banned", color: "#ef4444" },
  pending: { label: "Pending", color: "#3b82f6" },
  processing: { label: "Processing", color: "#8b5cf6" },
  delivered: { label: "Delivered", color: "#10b981" },
  failed: { label: "Failed", color: "#ef4444" },
  // Security Logs event types (app/superAdmin/(protected)/security-logs)
  login_success: { label: "Login Success", color: "#10b981" },
  login_failed: { label: "Login Failed", color: "#f59e0b" },
  admin_login_denied: { label: "Access Denied", color: "#ef4444" },
  rate_limit_hit: { label: "Rate Limited", color: "#ef4444" },
  admin_action: { label: "Admin Action", color: "#3b82f6" },
  sql_injection_attempt: { label: "SQLi Attempt", color: "#dc2626" },
  system_retention_purge: { label: "Retention Purge", color: "#71717a" },
  gatekeeper_breach: { label: "Gatekeeper Breach", color: "#dc2626" },
  vault_login_success: { label: "Vault Unlocked", color: "#10b981" },
  vault_login_failed: { label: "Vault Login Failed", color: "#f59e0b" },
  vault_otp_sent: { label: "Code Sent", color: "#3b82f6" },
  // AI Sales Insight severity (Dashboard widget, app/superAdmin/(protected)/dashboard)
  normal: { label: "Normal", color: "#71717a" },
  notable: { label: "Notable", color: "#f59e0b" },
  urgent: { label: "Urgent", color: "#dc2626" },
  vault_otp_verified: { label: "Code Verified", color: "#10b981" },
  vault_otp_failed: { label: "Code Rejected", color: "#f59e0b" },
  vault_passphrase_set: { label: "Passphrase Set", color: "#3b82f6" },
  vault_passphrase_rotated: { label: "Passphrase Rotated", color: "#8b5cf6" },
  vault_slug_guess_blocked: { label: "Vault Slug Blocked", color: "#dc2626" },
  // Booking status (Dashboard's Marketing Insights > Recent Bookings)
  confirmed: { label: "Confirmed", color: "#10b981" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
  // Walk-in Inquiries page (app/superAdmin/(protected)/walkin-inquiries)
  new: { label: "New", color: "#3b82f6" },
  contacted: { label: "Contacted", color: "#f59e0b" },
  converted: { label: "Converted", color: "#10b981" },
  // Backup Logs page (app/superAdmin/(protected)/backups)
  // R2 is the only backup destination (Google Drive dropped) — a run
  // is now simply success or failed, no "partial" state anymore.
  success: { label: "Success", color: "#10b981" },
  running: { label: "Running", color: "#3b82f6" },
  // Backup Logs page — Source column (trigger_source on BackupLog)
  nightly: { label: "Nightly", color: "#71717a" },
  manual: { label: "Manual", color: "#3b82f6" },
  pre_wipe: { label: "Pre-Wipe", color: "#f59e0b" },
  // Booking Rules Section 6 — room showcase (services/roomStatus.js)
  booked: { label: "Booked (Auto)", color: "#3b82f6" },
  cleaning: { label: "Cleaning (Auto)", color: "#f59e0b" },
  available: { label: "Available (Auto)", color: "#10b981" },
  maintenance: { label: "Maintenance", color: "#8b5cf6" },
  private: { label: "Private", color: "#ec4899" },
  custom: { label: "Custom", color: "#71717a" },
  // Testimonials page (app/superAdmin/(protected)/content/testimonials)
  // — visitor-submitted reviews awaiting super-admin approval
  pending_review: { label: "Pending Approval", color: "#3b82f6" },
  approved_review: { label: "Approved", color: "#10b981" },
  // Audit Logs page (app/superAdmin/(protected)/audit-logs) — action column
  created: { label: "Created", color: "#10b981" },
  updated: { label: "Updated", color: "#3b82f6" },
  deleted: { label: "Deleted", color: "#ef4444" },
};

export default function StatusBadge({ status }) {
  // Falls back to a neutral gray badge for any status not in the map,
  // so an unexpected value never crashes the row it's rendered in.
  const style = STATUS_STYLES[status] ?? { label: status ?? "Unknown", color: "#71717a" };

  return (
    <span
      className="statusBadge"
      style={{ backgroundColor: `${style.color}22`, color: style.color }}
    >
      {style.label}
    </span>
  );
}
