/**
 * FILE: components/superAdmin/AdminHeader.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Sticky top bar shown above every super-admin page. Shows the current
 * page title so admins always know which section they're in.
 *
 * DATA FLOW:
 * 1. Rendered once inside app/superAdmin/layout.jsx, above {children}
 * 2. pageTitle is static today ("Dashboard") — swap for a route-to-title
 *    lookup once more admin pages exist beyond the dashboard
 * 3. No data fetching — purely presentational
 */
import "./AdminHeader.css";

export default function AdminHeader() {
  return (
    <header className="adminHeader">
      <span className="adminHeaderTitle">Dashboard</span>
    </header>
  );
}
