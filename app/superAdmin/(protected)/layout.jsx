/**
 * FILE: app/superAdmin/(protected)/layout.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Shell for every AUTHENTICATED page under /superAdmin. Renders the
 * fixed left Sidebar and the sticky top AdminHeader around every
 * super-admin page. Lives inside the (protected) route group so
 * /superAdmin/login — a sibling folder outside this group — never
 * gets wrapped by this layout (login has no Sidebar/AdminHeader).
 *
 * DATA FLOW:
 * 1. Every route under app/superAdmin/(protected)/ renders inside this layout's {children}
 * 2. Now checks AdminProfile.isOwner once here (not previously done —
 *    see note below) and passes it to Sidebar as a prop, so the
 *    "Vault Passphrase" nav link only ever renders for the actual
 *    owner — every other admin account (role is always "super_admin"
 *    regardless of who they are) never sees that link exists at all.
 *    The page and API route it points to enforce this independently
 *    too (app/superAdmin/(protected)/settings/vault-passphrase/page.jsx),
 *    so hiding the link here is a discoverability improvement, not the
 *    only enforcement.
 * 3. AdminHeader is rendered once, shared across all admin pages
 * 4. Beyond the isOwner lookup, no session check happens here —
 *    proxy.js already blocked anyone without a valid superAdmin
 *    session before this layout ever renders
 * 5. SessionCloseGuard signs the admin out on tab/browser close;
 *    IdleTimeoutGuard signs the admin out after 30 minutes of no
 *    mouse/keyboard/scroll/touch activity while the tab stays open;
 *    SessionExpiryGuard catches the case those two don't — an already-
 *    invalid session (from any cause: idle timeout in another tab, the
 *    close-guard's beacon, the cookie's own 7-day expiry) that would
 *    otherwise leave the admin stuck on a page silently failing every
 *    data fetch with 401s instead of being sent back to /login
 *
 * ACCESSIBILITY:
 * A visually-hidden "Skip to main content" link is the first focusable
 * element in the DOM, so keyboard/screen-reader users can bypass the
 * Sidebar and AdminHeader and jump straight to #mainContent (WCAG 2.1 AAA).
 */
import { cookies } from "next/headers";
import "../SuperAdmin.css";
import { prisma } from "@/services/prisma";
import { requireSuperAdminFromCookieStore } from "@/services/adminSession";
import Sidebar from "@/components/superAdmin/Sidebar";
import AdminHeader from "@/components/superAdmin/AdminHeader";
import AccountActivityBeacon from "@/components/superAdmin/AccountActivityBeacon";
import SessionCloseGuard from "@/components/superAdmin/SessionCloseGuard";
import IdleTimeoutGuard from "@/components/superAdmin/IdleTimeoutGuard";
import SessionExpiryGuard from "@/components/superAdmin/SessionExpiryGuard";
import BreachAlertBanner from "@/components/superAdmin/BreachAlertBanner";
import DatabaseWipeGraceModal from "@/components/superAdmin/DatabaseWipeGraceModal";

export const metadata = {
  title: "Super-Admin | Villa Azure Resort",
  description: "Enterprise control center for managing Villa Azure Resort.",
};

export default async function SuperAdminLayout({ children }) {
  // Best-effort lookup only — proxy.js has already confirmed a valid
  // super_admin session exists before this layout ever renders, so a
  // missing/failed lookup here just means "don't show the owner-only
  // link," never "block the page." The page/API route behind that
  // link re-check ownership themselves regardless.
  let isOwner = false;
  try {
    const cookieStore = await cookies();
    const session = requireSuperAdminFromCookieStore(cookieStore);
    if (session) {
      const adminProfile = await prisma.adminProfile.findUnique({
        where: { id: session.uid },
        select: { isOwner: true },
      });
      isOwner = Boolean(adminProfile?.isOwner);
    }
  } catch (error) {
    console.error("[SuperAdminLayout] Failed to check isOwner:", error.message);
  }

  return (
    // superAdminRoot scopes the dark enterprise color tokens (SuperAdmin.css)
    // so they never leak into the visitor site's light theme.
    <div className="superAdminRoot">
      {/* Records this admin's page navigation for the Account Activity Log
          (Rule 42) — only ever mounted here, inside the authenticated shell,
          never in the public root layout, so it can never log an anonymous visitor. */}
      <AccountActivityBeacon />
      {/* Signs the admin out the instant this tab or the browser itself
          is closed — see SessionCloseGuard's file header for details. */}
      <SessionCloseGuard />
      {/* Signs the admin out after 30 minutes of no mouse/keyboard/scroll/
          touch activity, even if the tab is left open — see
          IdleTimeoutGuard's file header for details. */}
      <IdleTimeoutGuard />
      {/* Catches an already-invalid session before it turns into a
          page full of silent 401 errors — see the component's own
          file header for the exact two triggers it watches. */}
      <SessionExpiryGuard />
      <BreachAlertBanner />
      {/* Non-dismissible final warning shown once a scheduled database
          wipe has 2 hours or less remaining — see the component's own
          file header for why it's mounted globally, same as the
          breach banner above. */}
      <DatabaseWipeGraceModal />
      <a href="#mainContent" className="superAdminSkipLink">
        Skip to main content
      </a>
      <Sidebar isOwner={isOwner} />
      <div className="superAdminBody">
        <AdminHeader />
        <main id="mainContent" className="superAdminContent">
          {children}
        </main>
      </div>
    </div>
  );
}