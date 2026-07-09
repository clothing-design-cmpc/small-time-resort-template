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

/* Add entries here as new admin pages are built */
const navLinks = [
  { label: "Dashboard", href: "/superAdmin/dashboard" },
  { label: "Bookings", href: "/superAdmin/bookings" },
  { label: "Rooms & Villas", href: "/superAdmin/content/rooms" },
  { label: "Amenities", href: "/superAdmin/content/amenities" },
  { label: "Booking Rules", href: "/superAdmin/settings/booking-rules" },
  { label: "Security Logs", href: "/superAdmin/security-logs" },
  { label: "Visitor Logs", href: "/superAdmin/visitor-logs" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="adminSidebar" aria-label="Super-admin navigation">
      <div className="adminSidebarLogo">Villa Azure Admin</div>

      <ul className="adminSidebarNav">
        {navLinks.map((link) => {
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
    </nav>
  );
}
