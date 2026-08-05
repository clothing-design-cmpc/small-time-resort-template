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
 * 5. The 30-minute idle auto-logout itself still runs via
 *    components/superAdmin/IdleSessionProvider.jsx (mounted once in the
 *    layout) — only the visible "Session expires in mm:ss" badge was
 *    removed from this header; the admin still gets signed out after
 *    30 minutes of no mouse/keyboard/scroll/touch activity, just
 *    without a running countdown on screen.
 * 6. Date/Time: a plain client-side clock (Asia/Manila), ticking every
 *    second via setInterval — no server round-trip needed since it's
 *    just the current moment.
 * 7. Event/Season: fetched once on mount from GET /api/superAdmin/
 *    season-info (services/seasonInfo.js — same current-season logic
 *    Section 5's panel uses on the Booking Rules page), then
 *    refreshed every 5 minutes. Fails silently to "—" so a fetch
 *    error here never blocks the rest of the header from rendering.
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import { LogOut, ChevronDown, Clock, Calendar, Sparkles, Sun, Menu, X } from "lucide-react";
import { clearIdleDeadline } from "@/hooks/useIdleTimeout";
import { useSidebar } from "./SidebarContext";
import "./AdminHeader.css";

// Season/event rarely change within a session, so this only re-fetches
// every 5 minutes rather than polling constantly like the idle timer.
const SEASON_INFO_REFRESH_MS = 5 * 60 * 1000;

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

/* Add an entry here whenever a new admin page is built.
   Every route under app/superAdmin/(protected)/ must have a matching
   entry — a missing one silently falls back to the branded
   "{resort-name}-admin" label below, which reads like a bug (the
   header then shows the same text on every page instead of telling
   the admin where they are). */
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
  "/superAdmin/settings/admin-access-limit": "Admin Access Limit",
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
 * matching prefix for dynamic routes, then finally to the branded
 * "{resort-name}-admin" label if nothing matches at all.
 */
function resolvePageTitle(pathname, adminLabel) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefixMatch = PAGE_TITLE_PREFIXES.find((entry) => pathname.startsWith(entry.prefix));
  return prefixMatch?.label ?? adminLabel;
}

export default function AdminHeader({ adminLabel }) {
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef(null);
  const { isSidebarOpen, toggleSidebar } = useSidebar();

  const [adminName, setAdminName] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const pageTitle = resolvePageTitle(pathname, adminLabel);

  // Live clock — ticks every second, purely client-side (no server
  // round-trip needed for "what time is it right now").
  // Starts as null (not `new Date()`) so the server-rendered markup and
  // the client's first hydration pass produce identical output — seeding
  // this with new Date() causes two different timestamps to be formatted
  // (one at SSR time, one at hydration time), which is a hydration
  // mismatch. The real Date is only ever set client-side, inside this effect.
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Season/event — fetched from the server since both depend on
  // SeasonDefinition/BlackoutDate/BookingRule data the client doesn't
  // have locally. Refreshed periodically rather than on every render;
  // a stale-by-a-few-minutes season label is harmless.
  const [seasonInfo, setSeasonInfo] = useState({ season: null, event: null });
  const fetchSeasonInfo = useCallback(() => {
    axios
      .get("/api/superAdmin/season-info")
      .then((response) => {
        if (response.data?.success) setSeasonInfo(response.data.data);
      })
      .catch(() => {
        // Fails silently — the header still shows "—" for these two
        // fields rather than blocking the rest of the top bar.
      });
  }, []);
  useEffect(() => {
    fetchSeasonInfo();
    const refresh = setInterval(fetchSeasonInfo, SEASON_INFO_REFRESH_MS);
    return () => clearInterval(refresh);
  }, [fetchSeasonInfo]);

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
    clearIdleDeadline();
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
      <div className="adminHeaderLeft">
        {/* Hamburger — mobile/tablet only (hidden at 1024px+ via
            mediaQueries.css, same breakpoint the Sidebar drawer
            itself uses). Toggles the shared isSidebarOpen state from
            SidebarContext, which Sidebar.jsx reads to slide itself
            into view and render its click-to-close backdrop. */}
        <button
          type="button"
          className="adminHeaderHamburger"
          aria-label={isSidebarOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isSidebarOpen}
          onClick={toggleSidebar}
        >
          {isSidebarOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        <span className="adminHeaderTitle">{pageTitle}</span>
      </div>

      <div className="adminHeaderRight">
        {/* Date, Time, Event, Season — glanceable resort context without
            leaving the current page. Order matches the request: date
            first, then time, then what's happening today, then the
            general season. Each is its own small badge rather than one
            long string, so they wrap cleanly on narrower admin screens. */}
        <div className="adminHeaderInfoGroup">
          <span className="adminHeaderInfoBadge" title="Today's date (Asia/Manila)">
            <Calendar size={14} aria-hidden="true" />
            {now ? DATE_FORMATTER.format(now) : "—"}
          </span>
          <span className="adminHeaderInfoBadge" title="Current time (Asia/Manila)">
            <Clock size={14} aria-hidden="true" />
            {now ? TIME_FORMATTER.format(now) : "—"}
          </span>
          <span className="adminHeaderInfoBadge" title="What's happening today">
            <Sparkles size={14} aria-hidden="true" />
            {seasonInfo.event?.label ?? "No active event"}
          </span>
          <span
            className={`adminHeaderInfoBadge${
              seasonInfo.season?.seasonType === "peak" ? " adminHeaderInfoBadge--peak" : ""
            }`}
            title="Current Philippine season (Section 5, Booking Rules)"
          >
            <Sun size={14} aria-hidden="true" />
            {seasonInfo.season?.label ?? "No season set"}
          </span>
        </div>

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