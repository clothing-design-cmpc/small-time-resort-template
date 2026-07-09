/**
 * FILE: components/superAdmin/SessionCloseGuard.jsx
 * ROLE: Super-admin only — mounted inside the authenticated shell
 *
 * PURPOSE:
 * Automatically signs the admin out the moment the browser tab or the
 * whole browser window is closed, instead of leaving the 7-day session
 * cookie valid on a device the admin has walked away from. Works
 * alongside the idle-timeout pattern — this covers the "closed the
 * tab/browser" case, idle timeout covers the "left it open and unused"
 * case.
 *
 * DATA FLOW:
 * 1. Mounted once inside app/superAdmin/(protected)/layout.jsx
 * 2. Listens for the browser's "pagehide" event — fires when the tab
 *    is closed, the window is closed, or the admin navigates to a
 *    completely different site (a real Next.js Link click inside the
 *    app does NOT trigger this, since that's client-side routing with
 *    no page unload)
 * 3. On that event, fires navigator.sendBeacon(...) to POST
 *    /api/auth/logout — sendBeacon is used specifically because a
 *    normal fetch() gets cancelled mid-flight the instant the tab
 *    actually closes, while sendBeacon is guaranteed by the browser to
 *    still go out
 * 4. The next request from that browser (if any) has no valid session
 *    cookie left, so middleware.js sends it straight back to
 *    /superAdmin/login
 *
 * NOTE: A manual page refresh (F5) also triggers "pagehide" — there is
 * no reliable, browser-safe way to tell a refresh apart from a real
 * close before the page has already started unloading. This means a
 * refresh signs the admin out too, which is the accepted trade-off for
 * a hard "closing this tab always logs me out" guarantee.
 */
"use client";

import { useEffect } from "react";

export default function SessionCloseGuard() {
  useEffect(() => {
    function handlePageHide() {
      // No request body needed — the logout route only reads the
      // session cookie, which the browser attaches to the beacon
      // request automatically since it's same-origin.
      navigator.sendBeacon("/api/auth/logout");
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  return null;
}
