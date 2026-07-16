/**
 * FILE: app/system-vault-x9f2/page.jsx
 * ROLE: Super-admin only — protected by proxy.js (HIDDEN_RECOVERY_PATH),
 *       NOT part of the app/superAdmin route group and NOT linked from
 *       the Sidebar or anywhere else in the app. ADDITIONALLY gated
 *       behind its own separate vault-passphrase login — see below.
 *
 * PURPOSE:
 * The disaster-recovery page for the 3-Gatekeeper breach response
 * (Task 3). Deliberately kept outside app/superAdmin so it can never
 * show up in a route listing alongside the normal admin pages — only
 * a super-admin who already knows this exact URL can reach it, and
 * proxy.js still enforces the same super_admin session check any
 * other protected route gets.
 *
 * OWN LOGIN, SEPARATE FROM /superAdmin/login:
 * A valid super_admin session used to be the entire gate here, which
 * meant anyone holding that one session cookie — including a stolen
 * one — could open disaster recovery with nothing extra. This page now
 * ALSO requires its own "vaultSession" cookie (services/vaultAuth.js),
 * obtained only by submitting a separate vault passphrase at
 * /system-vault-x9f2/login. That passphrase is never stored in the
 * database and never checked against Supabase Auth — deliberately, so
 * this recovery path doesn't depend on the same auth stack a breach
 * could plausibly be compromising. Missing/expired vault session ->
 * redirect to the login screen instead of rendering recovery content.
 *
 * PURPOSE OF THE PAGE ITSELF:
 * Shows the current breach status (which gatekeeper tripped, when,
 * from which IP), lets the super-admin upload the pre-breach .sql
 * backup that was auto-exported to Google Drive when the gatekeeper
 * fired, and — once the restore looks good — end the site-wide
 * lockdown so the website is live again.
 *
 * DATA FLOW:
 * 1. This Server Component reads the "vaultSession" cookie directly
 *    (next/headers) — no vault session, no RecoveryClient, full stop
 * 2. RecoveryClient calls GET /api/admin/breach on mount for the
 *    live status (that route re-checks requireVaultSession() itself
 *    too, so this page-level redirect is a UX convenience, not the
 *    only enforcement point), and reuses the existing useSqlImport
 *    hook (same one the normal Backups page uses) for the file upload
 * 3. "End Lockdown" calls PATCH /api/admin/breach, which resolves the
 *    active BreachEvent and flips SystemSettings.breachLockdown off
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "./Recovery.css";
import RecoveryClient from "./RecoveryClient";
import { requireVaultSessionFromCookieStore } from "@/services/vaultAuth";

export const metadata = {
  title: "System Recovery",
  // Deliberately generic — this page's own metadata should never hint
  // at what it does to anyone who stumbles onto the URL without a session.
  description: "Restricted access.",
};

export default async function SystemRecoveryPage() {
  // No valid vault session -> the vault passphrase hasn't been entered
  // (or its 30-minute window expired) -> send to the vault's own login
  // screen instead of rendering any recovery content at all.
  const cookieStore = await cookies();
  if (!requireVaultSessionFromCookieStore(cookieStore)) {
    redirect("/system-vault-x9f2/login");
  }

  return (
    <div className="superAdminRoot recoveryRoot">
      <main className="recoveryContent">
        <RecoveryClient />
      </main>
    </div>
  );
}
