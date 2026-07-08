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

/* Add entries here as new admin pages are built. Rooms (Page 1),
   Amenities (Page 2), and Booking Rules (Page 7) are built — more
   will be appended as each subsequent page is built, one at a time. */
const navLinks = [
  { label: "Dashboard", href: "/superAdmin/dashboard" },
  { label: "Rooms", href: "/superAdmin/content/rooms" },
  { label: "Amenities", href: "/superAdmin/content/amenities" },
  { label: "Booking Rules", href: "/superAdmin/settings/booking-rules" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="adminSidebar" aria-label="Super-admin navigation">
      <div className="adminSidebarLogo">Villa Azure Admin</div>

      <ul className="adminSidebarNav">
        {navLinks.map((link) => {
          // Marks the current page's nav link so the admin always
          // knows where they are in the control center. Sub-routes
          // (e.g. /content/rooms/new) also count as active for their
          // parent link, not just an exact match.
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
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
    </nav>
  );
}
