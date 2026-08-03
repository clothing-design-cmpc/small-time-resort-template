/**
 * FILE: components/superAdmin/Sidebar.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fixed left navigation for the entire super-admin account. Permanent
 * on desktop (1024px+) — the mobile drawer transform is force-disabled
 * there (see mediaQueries.css). Below that, it's an off-canvas drawer:
 * hidden by default, slid into view only while isSidebarOpen (from
 * SidebarContext) is true, with a click-to-close backdrop behind it.
 * Highlights the active route so admins always know where they are.
 *
 * DATA FLOW:
 * 1. Rendered once inside app/superAdmin/(protected)/layout.jsx,
 *    inside <SidebarProvider> alongside AdminHeader (the hamburger
 *    that actually toggles isSidebarOpen — see SidebarContext.jsx)
 * 2. usePathname() reads the current route to mark the active nav
 *    link, AND to auto-close the mobile drawer the moment the route
 *    changes — without this, tapping a link would navigate but leave
 *    the drawer covering the new page until the admin taps the
 *    backdrop or hamburger themselves.
 * 3. Tapping the backdrop, or tapping any nav link directly, also
 *    closes the drawer immediately (before the route-change effect
 *    even fires) so the transition feels instant rather than waiting
 *    on navigation to complete.
 * 4. No data fetching — navLinks is fully static
 */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Plus } from "lucide-react";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useSidebar } from "./SidebarContext";
import "./Sidebar.css";

// Maps a nav link's href to which badge counter (from useNavBadges)
// applies to it, and which visual treatment that badge gets. Kept as a
// lookup instead of hardcoding hrefs inline below, so adding a badge to
// a future nav item is a one-line change here.
const BADGE_RULES = {
  "/superAdmin/walkin-inquiries": { countKey: "pendingWalkInCount", variant: "urgent", Icon: AlertCircle, ariaLabel: (count) => `${count} awaiting reply` },
  "/superAdmin/bookings": { countKey: "newBookingsCount", variant: "update", Icon: Plus, ariaLabel: (count) => `${count} pending` },
};

/* Add entries here as new admin pages are built. Grouped into sections
   since the flat list grew too long to scan once Content/Insights pages
   were added — grouping keeps each section quick to find.
   "Vault Passphrase" is intentionally NOT in this static list — it's
   appended conditionally below, only for the actual owner (see
   isOwner prop, passed down from layout.jsx's AdminProfile lookup). */
const navGroups = [
  {
    label: "Overview",
    links: [
      { label: "Dashboard", href: "/superAdmin/dashboard" },
      { label: "Bookings", href: "/superAdmin/bookings" },
      { label: "Walk-in Inquiries", href: "/superAdmin/walkin-inquiries" },
    ],
  },
  {
    label: "Content",
    links: [
      { label: "Rooms", href: "/superAdmin/content/rooms" },
      { label: "Amenities", href: "/superAdmin/content/amenities" },
      { label: "Resort Shop", href: "/superAdmin/content/shop" },
      { label: "Activities", href: "/superAdmin/content/activities" },
      { label: "Testimonials", href: "/superAdmin/content/testimonials" },
      { label: "Gallery", href: "/superAdmin/content/gallery" },
      { label: "Homepage", href: "/superAdmin/content/homepage" },
      { label: "Policies", href: "/superAdmin/content/policies" },
      { label: "Booking Email Templates", href: "/superAdmin/content/booking-confirmation-email" },
    ],
  },
  {
    label: "Settings",
    links: [
      { label: "Booking Rules", href: "/superAdmin/settings/booking-rules" },
      { label: "Admin Access Limit", href: "/superAdmin/settings/admin-access-limit" },
    ],
  },
  {
    label: "Insights",
    links: [
      { label: "Analytics", href: "/superAdmin/analytics" },
      { label: "Reports", href: "/superAdmin/reports" },
      { label: "Activity Feed", href: "/superAdmin/activity-feed" },
      { label: "Visitor Logs", href: "/superAdmin/visitor-logs" },
      { label: "Account Activity", href: "/superAdmin/account-activity" },
      { label: "API Usage", href: "/superAdmin/api-usage" },
    ],
  },
  {
    label: "Security",
    links: [
      { label: "Security Logs", href: "/superAdmin/security-logs" },
      { label: "Audit Logs", href: "/superAdmin/audit-logs" },
      { label: "Blocked IPs", href: "/superAdmin/blocked-ips" },
      { label: "Backups", href: "/superAdmin/backups" },
    ],
  },
];

export default function Sidebar({ isOwner = false }) {
  const pathname = usePathname();
  const badgeCounts = useNavBadges();
  const { isSidebarOpen, closeSidebar } = useSidebar();

  // Closes the mobile drawer the instant the route actually changes —
  // covers the back/forward-button case and any programmatic
  // navigation that doesn't go through a nav link's own onClick below.
  useEffect(() => {
    closeSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Vault passphrase generation/rotation and recovery-channel testing
  // are deliberately NOT exposed anywhere in this dashboard, even to
  // the owner — that credential is managed exclusively through the
  // hidden app/system-vault-setup page (VAULT_SETUP_KEY-gated, never
  // linked from here), keeping it out of the account a client logs
  // into daily. See app/system-vault-setup/page.jsx for why.
  const visibleNavGroups = navGroups;

  return (
    <>
      {/* Click-to-close backdrop — only ever visible on mobile widths
          (mediaQueries.css hides it entirely at 1024px+) and only
          rendered at all while the drawer is open, so it never sits
          in the DOM intercepting clicks the rest of the time. */}
      {isSidebarOpen && (
        <div className="adminSidebarBackdrop" onClick={closeSidebar} aria-hidden="true" />
      )}

      <nav
        className={`adminSidebar${isSidebarOpen ? " adminSidebar--open" : ""}`}
        aria-label="Super-admin navigation"
      >
        <div className="adminSidebarLogo">your-private-resort Admin</div>

        {visibleNavGroups.map((group) => (
          <div key={group.label} className="adminSidebarGroup">
            <span className="adminSidebarGroupLabel">{group.label}</span>
            <ul className="adminSidebarNav">
              {group.links.map((link) => {
                // Marks the current page's nav link so the admin always
                // knows where they are in the control center.
                const isActive = pathname === link.href;

                // Look up whether this link has a live badge counter
                // (Walk-in Inquiries -> urgent AlertCircle, Bookings ->
                // update Plus) and only render it once that counter is
                // above zero.
                const badgeRule = BADGE_RULES[link.href];
                const badgeCount = badgeRule ? badgeCounts[badgeRule.countKey] : 0;

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`adminSidebarLink${isActive ? " adminSidebarLink--active" : ""}`}
                      onClick={closeSidebar}
                    >
                      <span className="adminSidebarLinkLabel">{link.label}</span>
                      {badgeRule && badgeCount > 0 && (
                        <span
                          className={`adminSidebarBadge adminSidebarBadge--${badgeRule.variant}`}
                          aria-label={badgeRule.ariaLabel(badgeCount)}
                        >
                          <badgeRule.Icon size={11} strokeWidth={2.75} aria-hidden="true" />
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}