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
 * 3. This page reads the current maintenanceMessage directly (Server
 *    Component, no extra round trip) and renders MaintenanceLockdownScreen
 * 4. Stays this way until a super-admin lifts it from the hidden vault
 *    recovery page (PATCH /api/admin/post-wipe-lockdown) — see
 *    app/system-vault/[vaultSlug]/RecoveryClient.jsx's "Post-Wipe
 *    Lockdown" section
 */
import { prisma } from "@/services/prisma";
import MaintenanceLockdownScreen from "@/components/shared/MaintenanceLockdownScreen";

export const metadata = {
  title: "Under Maintenance | Villa Azure Resort",
  description: "This website is currently under maintenance.",
};

/**
 * getMaintenanceMessage
 * Fails open with the default in-component message on any DB error —
 * this page's entire job is to render SOMETHING even if the database
 * itself is in a bad state, which is exactly the scenario that put it
 * here in the first place.
 */
async function getMaintenanceMessage() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { maintenanceMessage: true },
    });
    return settings?.maintenanceMessage ?? "";
  } catch {
    return "";
  }
}

export default async function MaintenancePage() {
  const message = await getMaintenanceMessage();
  return <MaintenanceLockdownScreen message={message} />;
}
