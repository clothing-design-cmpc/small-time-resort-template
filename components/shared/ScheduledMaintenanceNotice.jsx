/**
 * FILE: components/shared/ScheduledMaintenanceNotice.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Small, persistent notice strip telling visitors in advance that the
 * site goes offline briefly every night for scheduled maintenance
 * (services/scheduledLockdown.js — default 2:00-3:00 AM PHT). Shown at
 * all times on every visitor page, not just during the window itself,
 * so a guest browsing at 1:55 AM (or planning a late-night booking)
 * isn't surprised when the site becomes unreachable a few minutes
 * later — proxy.js + MaintenanceLockdownScreen handle the actual
 * takeover once the window starts; this is purely the advance heads-up.
 *
 * Deliberately understated — a thin strip under the Header, not a
 * bold warning banner — since this is routine, expected downtime, not
 * an incident (contrast with MaintenanceBanner.jsx, which is for an
 * active, owner-toggled notice).
 */
import "./ScheduledMaintenanceNotice.css";
import { getScheduledLockdownWindowLabel } from "@/services/scheduledLockdown";

export default function ScheduledMaintenanceNotice() {
  return (
    <div className="scheduledMaintenanceNotice">
      <span className="scheduledMaintenanceNoticeIcon" aria-hidden="true">🕑</span>
      <p>
        This website undergoes brief nightly maintenance, {getScheduledLockdownWindowLabel()}, and may be
        temporarily unavailable during that time.
      </p>
    </div>
  );
}
