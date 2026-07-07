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
  suspended: { label: "Suspended", color: "#f59e0b" },
  banned: { label: "Banned", color: "#ef4444" },
  pending: { label: "Pending", color: "#3b82f6" },
  processing: { label: "Processing", color: "#8b5cf6" },
  delivered: { label: "Delivered", color: "#10b981" },
  failed: { label: "Failed", color: "#ef4444" },
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
