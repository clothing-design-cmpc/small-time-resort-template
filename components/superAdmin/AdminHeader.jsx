/**
 * FILE: components/superAdmin/AdminHeader.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Sticky top bar shown above every super-admin page. Shows the current
 * page title on the left, and a user menu (avatar initials, name, Sign
 * Out) on the right so admins always know which section they're in and
 * can always sign out from anywhere in the admin area.
 *
 * DATA FLOW:
 * 1. Rendered once inside app/superAdmin/(protected)/layout.jsx, above {children}
 * 2. usePathname() looks up the current route in PAGE_TITLES so the
 *    title stays correct as more admin pages are added
 * 3. On mount, fetches GET /api/superAdmin/me for the signed-in admin's
 *    name — the session cookie is HttpOnly, so the client can't read
 *    it directly and needs this endpoint instead
 * 4. Clicking "Sign Out" calls POST /api/auth/logout to clear the
 *    session cookie, then redirects to the login page
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import { LogOut, ChevronDown } from "lucide-react";
import "./AdminHeader.css";

/* Add an entry here whenever a new admin page is built.
   Every route under app/superAdmin/(protected)/ must have a matching
   entry — a missing one silently falls back to the generic
   "Villa Azure Admin" label below, which reads like a bug (the header
   then shows the same text on every page instead of telling the admin
   where they are). */
const PAGE_TITLES = {
  "/superAdmin/dashboard": "Dashboard",
  "/superAdmin/bookings": "Bookings",
  "/superAdmin/content/rooms": "Rooms",
  "/superAdmin/content/amenities": "Amenities",
  "/superAdmin/content/shop": "Resort Shop",
  "/superAdmin/content/activities": "Activities",
  "/superAdmin/content/testimonials": "Testimonials",
  "/superAdmin/content/gallery": "Gallery",
  "/superAdmin/content/homepage": "Homepage Customization",
  "/superAdmin/content/policies": "Policies",
  "/superAdmin/settings/booking-rules": "Booking Rules",
  "/superAdmin/analytics": "Analytics",
  "/superAdmin/activity-feed": "Activity Feed",
  "/superAdmin/visitor-logs": "Visitor Logs",
  "/superAdmin/account-activity": "Account Activity",
  "/superAdmin/security-logs": "Security Logs",
  "/superAdmin/backups": "Backups",
};

/*
 * PAGE_TITLE_PREFIXES
 * Covers dynamic sub-routes (edit/new/nested pages) that can't be
 * matched by exact pathname above — e.g. /superAdmin/content/rooms/abc123
 * or /superAdmin/content/rooms/new. Checked longest-prefix-first so a
 * more specific match (rooms/new) wins over a shorter one (rooms).
 */
const PAGE_TITLE_PREFIXES = [
  { prefix: "/superAdmin/content/rooms/new", label: "Add Room" },
  { prefix: "/superAdmin/content/shop/new", label: "Add Product" },
  { prefix: "/superAdmin/content/activities/new", label: "Add Activity" },
  { prefix: "/superAdmin/content/rooms", label: "Rooms" },
  { prefix: "/superAdmin/content/shop", label: "Resort Shop" },
  { prefix: "/superAdmin/content/activities", label: "Activities" },
];

/**
 * resolvePageTitle
 * Looks up the exact pathname first, then falls back to the closest
 * matching prefix for dynamic routes, then finally to the generic
 * "Villa Azure Admin" label if nothing matches at all.
 */
function resolvePageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefixMatch = PAGE_TITLE_PREFIXES.find((entry) => pathname.startsWith(entry.prefix));
  return prefixMatch?.label ?? "Villa Azure Admin";
}

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef(null);

  const [adminName, setAdminName] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const pageTitle = resolvePageTitle(pathname);

  // Loads the signed-in admin's name once on mount for the user menu.
  // Fails silently to a generic "Admin" label — a failed name fetch
  // should never block the admin from using the rest of the page.
  useEffect(() => {
    let isMounted = true;
    axios
      .get("/api/superAdmin/me")
      .then((response) => {
        if (isMounted) setAdminName(response.data?.data?.fullName ?? "Admin");
      })
      .catch(() => {
        if (isMounted) setAdminName("Admin");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Closes the dropdown on an outside click so it never lingers open
  // over other page content.
  useEffect(() => {
    function handleOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  /**
   * handleSignOut
   * Clears the HttpOnly session cookie server-side, then sends the
   * admin back to the login page. Always redirects even if the
   * logout request fails — an admin stuck on a "signing out" button
   * with no way forward is worse than a session that lingers briefly.
   */
  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await axios.post("/api/auth/logout");
    } catch {
      // Ignore — the cookie may already be gone or the request timed
      // out; either way we still want to send the admin to /login.
    } finally {
      router.push("/superAdmin/login");
    }
  }

  const initials = adminName
    ? adminName
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "A";

  return (
    <header className="adminHeader">
      <span className="adminHeaderTitle">{pageTitle}</span>

      <div className="adminHeaderRight">
        <div className="adminUserMenu" ref={menuRef}>
          <button
            type="button"
            className="adminUserMenuTrigger"
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <span className="adminUserAvatar" aria-hidden="true">{initials}</span>
            <span className="adminUserName">{adminName || "Admin"}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>

          {isMenuOpen && (
            <div className="adminUserMenuDropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="adminUserMenuSignOut"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                <LogOut size={16} aria-hidden="true" style={{ marginRight: "0.5rem", verticalAlign: "-2px" }} />
                {isSigningOut ? "Signing out…" : "Sign Out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
