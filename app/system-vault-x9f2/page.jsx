/**
 * FILE: app/system-vault-x9f2/page.jsx
 * ROLE: Super-admin only — protected by proxy.js (HIDDEN_RECOVERY_PATH),
 *       NOT part of the app/superAdmin route group and NOT linked from
 *       the Sidebar or anywhere else in the app
 *
 * PURPOSE:
 * The disaster-recovery page for the 3-Gatekeeper breach response
 * (Task 3). Deliberately kept outside app/superAdmin so it can never
 * show up in a route listing alongside the normal admin pages — only
 * a super-admin who already knows this exact URL can reach it, and
 * proxy.js still enforces the same super_admin session check any
 * other protected route gets (obscurity is the discovery barrier here,
 * not the auth barrier — the auth guard is real and identical to
 * every other admin-only route).
 *
 * PURPOSE OF THE PAGE ITSELF:
 * Shows the current breach status (which gatekeeper tripped, when,
 * from which IP), lets the super-admin upload the pre-breach .sql
 * backup that was auto-exported to Google Drive when the gatekeeper
 * fired, and — once the restore looks good — end the site-wide
 * lockdown so the website is live again.
 *
 * DATA FLOW:
 * 1. Server Component renders the shell + hands off to RecoveryClient
 * 2. RecoveryClient calls GET /api/admin/breach on mount for the
 *    live status, and reuses the existing useSqlImport hook (same one
 *    the normal Backups page uses) for the actual file upload
 * 3. "End Lockdown" calls PATCH /api/admin/breach, which resolves the
 *    active BreachEvent and flips SystemSettings.breachLockdown off
 */
import "@/app/superAdmin/SuperAdmin.css";
import "./Recovery.css";
import RecoveryClient from "./RecoveryClient";

export const metadata = {
  title: "System Recovery",
  // Deliberately generic — this page's own metadata should never hint
  // at what it does to anyone who stumbles onto the URL without a session.
  description: "Restricted access.",
};

export default function SystemRecoveryPage() {
  return (
    <div className="superAdminRoot recoveryRoot">
      <main className="recoveryContent">
        <RecoveryClient />
      </main>
    </div>
  );
}
