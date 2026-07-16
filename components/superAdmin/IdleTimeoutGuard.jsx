/**
 * FILE: components/superAdmin/IdleTimeoutGuard.jsx
 * ROLE: Super-admin only — mounted inside the authenticated shell
 *
 * PURPOSE:
 * Automatically signs the admin out after 30 minutes of no activity —
 * even if the browser tab stays open the whole time. Works alongside
 * SessionCloseGuard: that component covers "closed the tab/browser",
 * this one covers "left it open and unused". Without this, the
 * "session" cookie (7-day maxAge, app/api/auth/login/route.js) stays
 * valid on an unattended, signed-in device for up to a week.
 *
 * DATA FLOW:
 * 1. Mounted once inside app/superAdmin/(protected)/layout.jsx
 * 2. hooks/useIdleTimeout.js tracks mouse/keyboard/scroll/touch activity
 *    and fires handleIdleLogout() after 30 minutes of none of it
 * 3. handleIdleLogout() calls POST /api/auth/logout to clear the
 *    HttpOnly session cookie server-side, then redirects to
 *    /superAdmin/login?reason=idle-timeout
 * 4. The login page reads that reason and shows "Your session expired
 *    due to inactivity." instead of a bare login form — the redirect
 *    itself is what actually signs the admin out; the query param only
 *    explains why they landed back here
 */
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const IDLE_TIMEOUT_MINUTES = 30;

export default function IdleTimeoutGuard() {
  const router = useRouter();

  /**
   * handleIdleLogout
   * Fired when the admin has been idle for IDLE_TIMEOUT_MINUTES. Clears
   * the session cookie server-side first, then redirects — always
   * redirects even if the logout call fails, same reasoning as
   * AdminHeader's manual handleSignOut: an admin stuck on a dead page
   * with no way forward is worse than a session that lingers briefly.
   */
  const handleIdleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore — the cookie may already be gone or the request timed
      // out; either way we still want to send the admin back to /login.
    } finally {
      router.push("/superAdmin/login?reason=idle-timeout");
    }
  }, [router]);

  useIdleTimeout(handleIdleLogout, IDLE_TIMEOUT_MINUTES);

  return null;
}
