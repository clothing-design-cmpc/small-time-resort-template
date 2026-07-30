/**
 * FILE: components/superAdmin/IdleSessionProvider.jsx
 * ROLE: Super-admin only — mounted once inside
 * app/superAdmin/(protected)/layout.jsx, wrapping the entire
 * authenticated shell.
 *
 * PURPOSE:
 * FIXES THE "COUNTDOWN DOESN'T MATCH REAL TIME" BUG:
 * This used to be TWO separate useIdleTimeout() mounts — one inside
 * IdleTimeoutGuard (the real logout trigger) and a second, independent
 * one inside AdminHeader (the "Session expires in mm:ss" display
 * badge). Each ran its own setTimeout/setInterval pair and its own
 * five window activity listeners, both aimed at the same
 * sessionStorage deadline key but never reading each other's live
 * state. Most of the time they stayed close together, but any moment
 * where one instance's effect re-ran without the other's (React Fast
 * Refresh touching only one of the two files, React StrictMode's
 * dev-only double-invoke, or an activity event landing a few ms apart
 * for each listener under a busy main thread) let the two local
 * timers drift apart — the badge could show a different number than
 * the one actually driving the real sign-out. That is exactly what
 * reads as "the countdown ticks down, but the amount it adds/subtracts
 * doesn't match real elapsed time."
 *
 * FIX: there is now exactly ONE useIdleTimeout() call in the whole
 * super-admin area, owned here. IdleTimeoutGuard.jsx is retired; this
 * component does what it used to do (fires the real logout) and also
 * publishes the live secondsRemaining via IdleSessionContext.
 *
 * UPDATE: the visible "Session expires in mm:ss" badge was later
 * removed from AdminHeader (the 30-minute auto-logout itself is
 * unaffected and still fires the same way). useIdleSessionCountdown()
 * is kept exported here, unused for now, in case a future page wants
 * to show the countdown again — it will still read the exact same
 * value the real logout timer counts down, with no drift risk,
 * because it's the same underlying hook call either way.
 *
 * DATA FLOW:
 * 1. Mounted once in app/superAdmin/(protected)/layout.jsx, wrapping
 *    Sidebar + AdminHeader + {children}
 * 2. The single useIdleTimeout() call here fires the real logout after
 *    30 minutes of no mouse/keyboard/scroll/touch activity
 * 3. Any future consumer can call useIdleSessionCountdown() to read
 *    the exact same secondsRemaining — no separate timer needed
 */
"use client";

import { createContext, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const IDLE_TIMEOUT_MINUTES = 30;

const IdleSessionContext = createContext(0);

/**
 * useIdleSessionCountdown
 * Reads the single canonical secondsRemaining value published by
 * IdleSessionProvider. Returns 0 when called outside the provider —
 * should never happen inside the authenticated shell, but a 0 badge
 * is a safer fallback than a crash.
 */
export function useIdleSessionCountdown() {
  return useContext(IdleSessionContext);
}

export default function IdleSessionProvider({ children }) {
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

  const secondsRemaining = useIdleTimeout(handleIdleLogout, IDLE_TIMEOUT_MINUTES);

  return <IdleSessionContext.Provider value={secondsRemaining}>{children}</IdleSessionContext.Provider>;
}