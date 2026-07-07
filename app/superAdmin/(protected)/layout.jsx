/**
 * FILE: app/superAdmin/(protected)/layout.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
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
 * 2. Sidebar and AdminHeader are rendered once, shared across all admin pages
 * 3. No session check happens here — middleware.js already blocked anyone
 *    without a valid superAdmin session before this layout ever renders
 *
 * ACCESSIBILITY:
 * A visually-hidden "Skip to main content" link is the first focusable
 * element in the DOM, so keyboard/screen-reader users can bypass the
 * Sidebar and AdminHeader and jump straight to #mainContent (WCAG 2.1 AAA).
 */
import "../SuperAdmin.css";
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
      <a href="#mainContent" className="superAdminSkipLink">
        Skip to main content
      </a>
      <Sidebar />
      <div className="superAdminBody">
        <AdminHeader />
        <main id="mainContent" className="superAdminContent">
          {children}
        </main>
      </div>
    </div>
  );
}
