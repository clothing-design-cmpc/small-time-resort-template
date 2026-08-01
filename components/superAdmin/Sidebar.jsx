/**
 * FILE: components/superAdmin/Sidebar.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fixed left navigation for the entire super-admin account. Never
 * collapses on desktop; hidden behind a hamburger on mobile. Highlights
 * the active route so admins always know where they are.
 *
 * DATA FLOW:
 * 1. Rendered once inside app/superAdmin/layout.jsx
 * 2. usePathname() reads the current route to mark the active nav link
 * 3. No data fetching — navLinks is fully static
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Plus } from "lucide-react";
import { useNavBadges } from "@/hooks/useNavBadges";
import "./Sidebar.css";

// Maps a nav link's href to which badge counter (from useNavBadges)
// applies to it, and which visual treatment that badge gets. Kept as a
// lookup instead of hardcoding hrefs inline below, so adding a badge to
// a future nav item is a one-line change here.
const BADGE_RULES = {
  "/superAdmin/walkin-inquiries": { countKey: "pendingWalkInCount", variant: "urgent", Icon: AlertCircle },
  "/superAdmin/bookings": { countKey: "newBookingsCount", variant: "update", Icon: Plus },
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

  // Vault passphrase generation/rotation and recovery-channel testing
  // are deliberately NOT exposed anywhere in this dashboard, even to
  // the owner — that credential is managed exclusively through the
  // hidden app/system-vault-setup page (VAULT_SETUP_KEY-gated, never
  // linked from here), keeping it out of the account a client logs
  // into daily. See app/system-vault-setup/page.jsx for why.
  const visibleNavGroups = navGroups;

  return (
    <nav className="adminSidebar" aria-label="Super-admin navigation">
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
                  >
                    <span className="adminSidebarLinkLabel">{link.label}</span>
                    {badgeRule && badgeCount > 0 && (
                      <span
                        className={`adminSidebarBadge adminSidebarBadge--${badgeRule.variant}`}
                        aria-label={
                          badgeRule.variant === "urgent"
                            ? `${badgeCount} awaiting reply`
                            : `${badgeCount} new`
                        }
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
  );
}