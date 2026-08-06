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
 * 2. AdminHeader is rendered once, shared across all admin pages.
 *    SidebarProvider wraps Sidebar + AdminHeader/{children} so the
 *    header's mobile hamburger button and the sidebar drawer it opens
 *    can share one "is it open" state despite being sibling components
 *    — see SidebarContext.jsx's file header for why that's needed.
 * 3. No session check happens here — proxy.js already blocked anyone
 *    without a valid superAdmin session before this layout ever renders
 * 4. SessionCloseGuard signs the admin out on tab/browser close;
 *    IdleSessionProvider owns the single idle-timeout timer that signs
 *    the admin out after 30 minutes of no mouse/keyboard/scroll/touch
 *    activity while the tab stays open, and publishes the live
 *    countdown via context to AdminHeader's badge;
 *    SessionExpiryGuard catches the case those two don't — an already-
 *    invalid session (from any cause: idle timeout in another tab, the
 *    close-guard's beacon, the cookie's own 7-day expiry) that would
 *    otherwise leave the admin stuck on a page silently failing every
 *    data fetch with 401s instead of being sent back to /login
 * 5. This layout is itself a Server Component, so it fetches the
 *    saved SystemSettings.siteTitle directly (Rule 31.1/31.2 — no
 *    client round trip needed) and passes it to <Sidebar> as
 *    resortName, so the sidebar logo reads "<your resort name> Admin"
 *    instead of the literal "your-private-resort Admin" placeholder
 *    the wizard's BrandingCard (Step 3) is meant to replace.
 *
 * ACCESSIBILITY:
 * A visually-hidden "Skip to main content" link is the first focusable
 * element in the DOM, so keyboard/screen-reader users can bypass the
 * Sidebar and AdminHeader and jump straight to #mainContent (WCAG 2.1 AAA).
 */
import "../SuperAdmin.css";
import Sidebar from "@/components/superAdmin/Sidebar";
import AdminHeader from "@/components/superAdmin/AdminHeader";
import { SidebarProvider } from "@/components/superAdmin/SidebarContext";
import AccountActivityBeacon from "@/components/superAdmin/AccountActivityBeacon";
import SessionCloseGuard from "@/components/superAdmin/SessionCloseGuard";
import IdleSessionProvider from "@/components/superAdmin/IdleSessionProvider";
import SessionExpiryGuard from "@/components/superAdmin/SessionExpiryGuard";
import BreachAlertBanner from "@/components/superAdmin/BreachAlertBanner";
import DatabaseWipeGraceModal from "@/components/superAdmin/DatabaseWipeGraceModal";
import { prisma } from "@/services/prisma";

export const metadata = {
  title: "Super-Admin | your-private-resort",
  description: "Enterprise control center for managing your-private-resort.",
};

export default async function SuperAdminLayout({ children }) {
  // Read-only — get-or-create is Step 3's BrandingCard/branding route's
  // job, not this layout's; a missing row just falls back to the same
  // "your-private-resort" placeholder the sidebar always showed before.
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { siteTitle: true },
  });
  const resortName = settings?.siteTitle?.trim() || "your-private-resort";

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
      {/* Owns the ONE idle-timeout timer for the whole admin area — signs
          the admin out after 30 minutes of no mouse/keyboard/scroll/touch
          activity, and publishes the live countdown via context so
          AdminHeader's badge (a descendant here) reads the exact same
          number, never a second, independently-drifting one. See
          IdleSessionProvider's file header for details. */}
      <IdleSessionProvider>
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
        <SidebarProvider>
          <Sidebar resortName={resortName} />
          <div className="superAdminBody">
            <AdminHeader />
            <main id="mainContent" className="superAdminContent">
              {children}
            </main>
          </div>
        </SidebarProvider>
      </IdleSessionProvider>
    </div>
  );
}