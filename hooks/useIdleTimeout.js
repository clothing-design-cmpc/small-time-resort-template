/**
 * FILE: hooks/useIdleTimeout.js
 * PURPOSE:
 * Monitors user activity across the entire page. If no activity is
 * detected for the specified idle duration, it fires the onIdle
 * callback — which should log the user out. Matches the 30-minute
 * idle-timeout standard used elsewhere in the admin area (same window
 * as VAULT_SESSION_COOKIE_MAX_AGE_SECONDS, services/vaultAuth.js).
 *
 * Tracked events: mousemove, mousedown, keydown, scroll, touchstart —
 * these cover mouse, keyboard-only, and mobile/touch users. A device
 * merely being on with the tab open and untouched does NOT reset the
 * timer — only one of these five events does.
 *
 * DATA FLOW:
 * 1. Mounted inside app/superAdmin/(protected)/layout.jsx via
 *    components/superAdmin/IdleTimeoutGuard.jsx (drives the real
 *    logout), and again inside AdminHeader.jsx with a no-op onIdle
 *    (drives the visible "Session expires in mm:ss" countdown only —
 *    IdleTimeoutGuard remains the single place the actual logout fires
 *    from, so this second mount never causes a double sign-out)
 * 2. Starts a countdown immediately on mount (admin just loaded an
 *    authenticated page)
 * 3. Any tracked activity event resets the countdown back to the full
 *    idle duration
 * 4. If the countdown ever completes uninterrupted, onIdle() fires once
 * 5. secondsRemaining ticks down every second off the SAME target
 *    timestamp the timeout itself uses (not a separate counter), so the
 *    displayed number and the actual moment onIdle() fires can never
 *    drift apart
 */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useIdleTimeout
 * @param {() => void} onIdle - Callback fired when idle timeout is reached (logout function)
 * @param {number} idleMinutes - Minutes of inactivity before firing onIdle (default: 30)
 * @returns {number} secondsRemaining - live countdown, for display purposes
 */
export function useIdleTimeout(onIdle, idleMinutes = 30) {
  const idleTimerRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const targetTimeRef = useRef(null);
  const idleDurationMs = idleMinutes * 60 * 1000;

  const [secondsRemaining, setSecondsRemaining] = useState(Math.round(idleDurationMs / 1000));

  /**
   * resetTimer
   * Clears the existing idle timeout + display interval and starts
   * fresh ones against a new target timestamp. Called once on mount
   * and again every time a tracked activity event fires.
   */
  const resetTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);

    const targetTime = Date.now() + idleDurationMs;
    targetTimeRef.current = targetTime;
    setSecondsRemaining(Math.round(idleDurationMs / 1000));

    // Start a new countdown — if it completes uninterrupted, the admin
    // has been idle too long and onIdle() (auto-logout) fires.
    idleTimerRef.current = setTimeout(() => {
      onIdle();
    }, idleDurationMs);

    // Recomputes secondsRemaining from the actual target timestamp
    // (never from a naive decrementing counter) so a throttled/
    // backgrounded tab catches back up to the true remaining time the
    // instant it's visible again, instead of drifting.
    tickIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((targetTimeRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    }, 1000);
  }, [onIdle, idleDurationMs]);

  useEffect(() => {
    // Events that signal the admin is actively using the page — covers
    // mouse, keyboard-only, and touch/mobile interaction.
    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimer));

    // Start the initial countdown immediately (admin just arrived on an
    // authenticated page — the clock starts now, not after the first
    // activity event).
    resetTimer();

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [resetTimer]);

  return secondsRemaining;
}
