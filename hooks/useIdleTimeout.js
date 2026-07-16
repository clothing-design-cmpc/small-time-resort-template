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
 *    components/superAdmin/IdleTimeoutGuard.jsx
 * 2. Starts a countdown immediately on mount (admin just loaded an
 *    authenticated page)
 * 3. Any tracked activity event resets the countdown back to the full
 *    idle duration
 * 4. If the countdown ever completes uninterrupted, onIdle() fires once
 */
import { useCallback, useEffect, useRef } from "react";

/**
 * useIdleTimeout
 * @param {() => void} onIdle - Callback fired when idle timeout is reached (logout function)
 * @param {number} idleMinutes - Minutes of inactivity before firing onIdle (default: 30)
 */
export function useIdleTimeout(onIdle, idleMinutes = 30) {
  const idleTimerRef = useRef(null);
  const idleDurationMs = idleMinutes * 60 * 1000;

  /**
   * resetTimer
   * Clears the existing idle timer and starts a fresh one. Called once
   * on mount and again every time a tracked activity event fires.
   */
  const resetTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // Start a new countdown — if it completes uninterrupted, the admin
    // has been idle too long and onIdle() (auto-logout) fires.
    idleTimerRef.current = setTimeout(() => {
      onIdle();
    }, idleDurationMs);
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
    };
  }, [resetTimer]);
}
