/**
 * FILE: app/superAdmin/layout.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Shell for every page under /superAdmin. Renders the fixed left
 * Sidebar and the sticky top AdminHeader around every super-admin
 * page. Applies the enterprise dark-first design tokens scoped to
 * this account only (visitor site keeps its own light theme).
 *
 * DATA FLOW:
 * 1. Every route under app/superAdmin/ renders inside this layout's {children}
 * 2. Sidebar and AdminHeader are rendered once, shared across all admin pages
 * 3. No session check happens here — middleware.js already blocked anyone
 *    without a valid superAdmin session before this layout ever renders
 */
import "./SuperAdmin.css";
import Sidebar from "@/components/superAdmin/Sidebar";
import AdminHeader from "@/components/superAdmin/AdminHeader";

export const metadata = {
  title: "Super-Admin | Villa Azure Resort",
  description: "Enterprise control center for managing Villa Azure Resort.",
};

export default function SuperAdminLayout({ children }) {
  return (
    // superAdminRoot scopes the dark enterprise color tokens (SuperAdmin.css)
    // so they never leak into the visitor site's light theme.
    <div className="superAdminRoot">
      <Sidebar />
      <div className="superAdminBody">
        <AdminHeader />
        <main className="superAdminContent">{children}</main>
      </div>
    </div>
  );
}
