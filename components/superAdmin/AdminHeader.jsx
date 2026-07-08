/**
 * FILE: components/superAdmin/AdminHeader.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Sticky top bar shown above every super-admin page. Shows the current
 * page title so admins always know which section they're in.
 *
 * DATA FLOW:
 * 1. Rendered once inside app/superAdmin/(protected)/layout.jsx, above {children}
 * 2. usePathname() looks up the current route in PAGE_TITLES so the
 *    title stays correct as more admin pages are added — no more
 *    hardcoded "Dashboard" string now that Bookings exists too
 * 3. No data fetching — purely presentational
 */
"use client";

import { usePathname } from "next/navigation";
import "./AdminHeader.css";

/* Add an entry here whenever a new admin page is built */
const PAGE_TITLES = {
  "/superAdmin/dashboard": "Dashboard",
  "/superAdmin/bookings": "Bookings",
};

export default function AdminHeader() {
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] ?? "Villa Azure Admin";

  return (
    <header className="adminHeader">
      <span className="adminHeaderTitle">{pageTitle}</span>
    </header>
  );
}
