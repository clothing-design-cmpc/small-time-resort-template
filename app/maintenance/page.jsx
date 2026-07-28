/**
 * FILE: app/maintenance/page.jsx
 * ROLE: Public — no auth, reachable by anyone, visitor or super-admin
 *
 * PURPOSE:
 * The dedicated post-wipe maintenance page (Task 2). proxy.js redirects
 * EVERY request — visitor pages, /superAdmin/* pages, and every /api
 * route gets a 503 JSON instead — here the instant SystemSettings.
 * postWipeLockdown is true, and clears the "session" cookie on the way,
 * so a logged-in super-admin's next click both lands here AND finds
 * their session already gone (Task 2's "automatic logout").
 *
 * This route itself is EXCLUDED from that same redirect in proxy.js
 * (checked by exact pathname), so it never redirects to itself in a
 * loop, and it renders even while the rest of the app is fully dark.
 *
 * DATA FLOW:
 * 1. scripts/runDatabaseWipe.js truncates successfully -> flips
 *    SystemSettings.postWipeLockdown on
 * 2. proxy.js sees the flag on the very next request to ANY route and
 *    redirects here (pages) or 503s (API), clearing the session cookie
 * 3. This page reads postWipeLockdown + maintenanceMessage directly
 *    (Server Component, no extra round trip) and renders
 *    MaintenanceLockdownScreen
 * 4. Stays this way until a super-admin lifts it from the hidden vault
 *    recovery page (PATCH /api/admin/post-wipe-lockdown) — see
 *    app/system-vault/[vaultSlug]/RecoveryClient.jsx's "Post-Wipe
 *    Lockdown" section
 *
 * NOTE — self-check on lockdown state:
 * This route is deliberately exempted from proxy.js's redirect (see
 * isPostWipeLockdownExemptPath()) so it stays reachable while the rest
 * of the site is dark. That exemption is unconditional by pathname —
 * proxy.js never re-checks the flag for THIS route once you're already
 * on it. Previously that meant the page rendered unconditionally: once
 * lifted from the vault, every other route correctly stopped
 * redirecting here, but a tab already sitting on /maintenance (or
 * anyone who reloads/revisits it directly) kept seeing "Under
 * Maintenance" forever, even though the site was already back online.
 * This page now checks SystemSettings.postWipeLockdown itself on every
 * request and bounces to "/" the moment it's false, so this page never
 * outlives the lockdown it exists to represent.
 */
import { redirect } from "next/navigation";
import { prisma } from "@/services/prisma";
import { isScheduledLockdownActive, getScheduledLockdownWindowLabel } from "@/services/scheduledLockdown";
import MaintenanceLockdownScreen from "@/components/shared/MaintenanceLockdownScreen";

// Forces this page to always re-run getMaintenanceMessage() on every
// request instead of being statically cached (Next.js's default for a
// Server Component with no cookies()/headers()/fetch() call to signal
// "dynamic"). Without this, the FIRST render of /maintenance gets
// cached and every later visit — even after the lockdown is lifted and
// the DB row changes — kept serving that same stale HTML.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Under Maintenance | your-private-resort",
  description: "This website is currently under maintenance.",
};

/**
 * getMaintenanceState
 * Reads both the lockdown flag and the message in one query. Fails
 * open with postWipeLockdown: true (and the default message) on any
 * DB error — this page's entire job is to render SOMETHING even if
 * the database itself is in a bad state, which is exactly the
 * scenario that put it here in the first place. Failing open here
 * means "keep showing the maintenance screen," never "silently let
 * guests back onto a site that might still be broken."
 */
async function getMaintenanceState() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { postWipeLockdown: true, maintenanceMessage: true },
    });
    return {
      postWipeLockdown: settings?.postWipeLockdown ?? true,
      message: settings?.maintenanceMessage ?? "",
    };
  } catch {
    return { postWipeLockdown: true, message: "" };
  }
}

export default async function MaintenancePage() {
  const { postWipeLockdown, message } = await getMaintenanceState();

  // Post-wipe takes priority — it's the more severe, indefinite
  // lockdown and always shows its own DB-configured message.
  if (postWipeLockdown) {
    return <MaintenanceLockdownScreen message={message} />;
  }

  // Scheduled nightly window (proxy.js already redirected here for
  // this reason) — self-computed, so re-check it directly rather than
  // trusting a DB flag that doesn't exist for this case.
  if (isScheduledLockdownActive()) {
    return (
      <MaintenanceLockdownScreen
        message={`This website is briefly unavailable for scheduled nightly maintenance, ${getScheduledLockdownWindowLabel()}. Please check back shortly.`}
      />
    );
  }

  // Neither lockdown is active — this tab is just stale (never
  // navigated away) or someone hit the URL directly. Send them to the
  // live site instead of showing a stale "Under Maintenance" screen.
  redirect("/");
}