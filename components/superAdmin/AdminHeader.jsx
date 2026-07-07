/**
 * FILE: components/superAdmin/AdminHeader.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Sticky top bar shown above every super-admin page. Per the design
 * system's Dashboard Header spec: breadcrumb (left), page title, and a
 * user menu with a working sign-out action (far right).
 *
 * DATA FLOW:
 * 1. Rendered once inside app/superAdmin/(protected)/layout.jsx, above {children}
 * 2. pageTitle/breadcrumb are static today ("Dashboard") — swap for a
 *    route-to-title lookup once more admin pages exist beyond the dashboard
 * 3. handleSignOut calls POST /api/auth/logout, then hard-navigates to
 *    /superAdmin/login so the cleared session cookie is respected immediately
 */
"use client";

import { useState } from "react";
import "./AdminHeader.css";

export default function AdminHeader() {
  // Controls the open/closed state of the user menu dropdown
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  /**
   * handleSignOut
   * Clears the HttpOnly session cookie via the logout API route, then
   * redirects to the login page. Uses window.location (not next/navigation)
   * so the browser performs a full reload — guarantees no stale
   * client-side state survives after sign-out.
   */
  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/superAdmin/login";
  }

  return (
    <header className="adminHeader">
      <div className="adminHeaderLeft">
        {/* Breadcrumb — static single-level today, extend as nested admin
            routes (e.g. Users > User Detail) are built */}
        <nav aria-label="Breadcrumb" className="adminBreadcrumb">
          <span>Super-Admin</span>
          <span className="adminBreadcrumbSeparator" aria-hidden="true">/</span>
          <span className="adminBreadcrumbCurrent">Dashboard</span>
        </nav>
        <h1 className="adminHeaderTitle">Dashboard</h1>
      </div>

      <div className="adminHeaderRight">
        <div className="adminUserMenu">
          <button
            type="button"
            className="adminUserMenuTrigger"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span className="adminUserAvatar" aria-hidden="true">SA</span>
            <span className="adminUserName">Super Admin</span>
          </button>

          {isMenuOpen && (
            <div className="adminUserMenuDropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="adminUserMenuSignOut"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
