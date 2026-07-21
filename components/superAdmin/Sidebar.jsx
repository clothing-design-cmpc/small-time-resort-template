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
import "./Sidebar.css";

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
      { label: "Rooms & Villas", href: "/superAdmin/content/rooms" },
      { label: "Amenities", href: "/superAdmin/content/amenities" },
      { label: "Resort Shop", href: "/superAdmin/content/shop" },
      { label: "Activities", href: "/superAdmin/content/activities" },
      { label: "Testimonials", href: "/superAdmin/content/testimonials" },
      { label: "Gallery", href: "/superAdmin/content/gallery" },
      { label: "Homepage", href: "/superAdmin/content/homepage" },
      { label: "Policies", href: "/superAdmin/content/policies" },
    ],
  },
  {
    label: "Settings",
    links: [{ label: "Booking Rules", href: "/superAdmin/settings/booking-rules" }],
  },
  {
    label: "Insights",
    links: [
      { label: "Analytics", href: "/superAdmin/analytics" },
      { label: "Activity Feed", href: "/superAdmin/activity-feed" },
      { label: "Visitor Logs", href: "/superAdmin/visitor-logs" },
      { label: "Account Activity", href: "/superAdmin/account-activity" },
    ],
  },
  {
    label: "Security",
    links: [
      { label: "Security Logs", href: "/superAdmin/security-logs" },
      { label: "Gatekeeper Tester", href: "/superAdmin/gatekeeper-tester" },
      { label: "Backups", href: "/superAdmin/backups" },
    ],
  },
];

export default function Sidebar({ isOwner = false }) {
  const pathname = usePathname();

  // Owner-only link, appended here (never in the static navGroups
  // array above) so a non-owner admin's Sidebar never renders it, and
  // never has a reason to inspect the page source for a link that was
  // conditionally removed vs. one that was simply never built yet.
  const visibleNavGroups = isOwner
    ? navGroups.map((group) =>
        group.label === "Security"
          ? { ...group, links: [...group.links, { label: "Vault Passphrase", href: "/superAdmin/settings/vault-passphrase" }] }
          : group
      )
    : navGroups;

  return (
    <nav className="adminSidebar" aria-label="Super-admin navigation">
      <div className="adminSidebarLogo">Villa Azure Admin</div>

      {visibleNavGroups.map((group) => (
        <div key={group.label} className="adminSidebarGroup">
          <span className="adminSidebarGroupLabel">{group.label}</span>
          <ul className="adminSidebarNav">
            {group.links.map((link) => {
              // Marks the current page's nav link so the admin always
              // knows where they are in the control center.
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`adminSidebarLink${isActive ? " adminSidebarLink--active" : ""}`}
                  >
                    {link.label}
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