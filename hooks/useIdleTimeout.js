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
 * PERSISTED DEADLINE — FIX FOR "OPENING A NEW TAB RESETS THE COUNTDOWN":
 * Previously the countdown deadline lived only in this hook's own
 * component state, computed fresh as "now + 30 minutes" every time the
 * hook's effect ran. That's correct on a genuine first mount, but it
 * meant ANY remount of the component holding this hook — switching to
 * a different browser tab and back, the window losing and regaining
 * focus, or anything else that causes React to re-run this effect —
 * silently pushed the real logout time 30 minutes further into the
 * future, even though nothing the admin actually DID counts as
 * activity. The countdown badge visibly snapping back to 30:00 on a
 * tab switch was the symptom; an admin who kept a second tab open and
 * glanced back at it every so often would never actually get signed
 * out, no matter how long the account itself sat untouched.
 *
 * The fix: the deadline itself — a single absolute timestamp, not a
 * duration — is written to sessionStorage the moment it's set, and
 * read back from there on every mount. A remount now finds the SAME
 * deadline already sitting in sessionStorage and schedules against
 * it as-is; it is never pushed further out just because a component
 * happened to mount again. Only an actual tracked activity event
 * computes and stores a NEW deadline. sessionStorage is scoped to this
 * one browser tab (not shared with other tabs, and gone the moment the
 * tab actually closes), so this doesn't change the existing "each tab
 * manages its own idle timer independently" guarantee — it only stops
 * an in-tab remount from acting like fresh activity.
 *
 * SHARED KEY, ONE CLOCK: IdleTimeoutGuard (the real logout) and
 * AdminHeader (the display-only countdown) both call this hook and
 * both read/write the same sessionStorage key, so they now track the
 * exact same deadline instead of two independently-computed timers
 * that could drift apart from each other by a second or two.
 *
 * DATA FLOW:
 * 1. Mounted inside app/superAdmin/(protected)/layout.jsx via
 *    components/superAdmin/IdleTimeoutGuard.jsx (drives the real
 *    logout), and again inside AdminHeader.jsx with a no-op onIdle
 *    (drives the visible "Session expires in mm:ss" countdown only —
 *    IdleTimeoutGuard remains the single place the actual logout fires
 *    from, so this second mount never causes a double sign-out)
 * 2. On mount, reads any existing deadline from sessionStorage. If
 *    none exists yet (genuinely new tab/session) it creates one at
 *    "now + 30 minutes". Either way it schedules against whatever
 *    deadline is now on record — never silently extends an
 *    already-running one.
 * 3. Any tracked activity event computes a brand new deadline ("now +
 *    30 minutes"), persists it, and reschedules against it — this is
 *    the ONLY thing that's allowed to push the logout time further out.
 * 4. If the countdown ever completes uninterrupted, onIdle() fires once
 *    and the stored deadline is cleared (so a later fresh login on the
 *    same tab doesn't inherit a stale, already-expired timestamp).
 * 5. secondsRemaining ticks down every second off the SAME target
 *    timestamp the timeout itself uses (not a separate counter), so the
 *    displayed number and the actual moment onIdle() fires can never
 *    drift apart
 */
import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_DEADLINE_STORAGE_KEY = "superAdmin:idleDeadline";

/**
 * readStoredDeadline
 * Best-effort read of the persisted deadline timestamp. Returns null
 * on anything unexpected (private browsing blocking storage, a
 * corrupted value, storage simply being empty) so the caller always
 * has a clean fallback: treat it exactly like no deadline exists yet.
 */
function readStoredDeadline() {
  try {
    const raw = sessionStorage.getItem(IDLE_DEADLINE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : null;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * writeStoredDeadline
 * Best-effort persist — a write failure (storage disabled/full) should
 * never crash the idle timer itself, it just means this particular
 * remount-survival guarantee silently doesn't apply that one time.
 */
function writeStoredDeadline(deadline) {
  try {
    sessionStorage.setItem(IDLE_DEADLINE_STORAGE_KEY, String(deadline));
  } catch {
    // Ignore — the in-memory timer below still works for this mount.
  }
}

/** Clears the persisted deadline — called once onIdle actually fires. */
function clearStoredDeadline() {
  try {
    sessionStorage.removeItem(IDLE_DEADLINE_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * clearIdleDeadline
 * Exported so a MANUAL sign-out (the admin clicking "Sign Out" in
 * AdminHeader, or IdleTimeoutGuard's own idle-triggered logout) can
 * clear this tab's stored deadline too — otherwise a still-in-the-
 * future deadline from the session that just ended would carry over
 * and apply to whichever admin logs in next on this same tab, and an
 * already-past one would fire an immediate, confusing "session expired"
 * the moment the fresh login's IdleTimeoutGuard mounts.
 */
export function clearIdleDeadline() {
  clearStoredDeadline();
}

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
   * scheduleForDeadline
   * Clears any existing timeout/interval and schedules fresh ones
   * against a GIVEN absolute deadline (not "now + duration") — the
   * deadline itself is decided by the caller, so a remount that hands
   * this an already-in-progress deadline schedules the remaining time,
   * not a fresh 30 minutes.
   */
  const scheduleForDeadline = useCallback(
    (deadline) => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);

      targetTimeRef.current = deadline;
      const msRemaining = Math.max(0, deadline - Date.now());
      setSecondsRemaining(Math.round(msRemaining / 1000));

      // Start a countdown for whatever time is actually left — if it
      // completes uninterrupted, the admin has been idle too long and
      // onIdle() (auto-logout) fires.
      idleTimerRef.current = setTimeout(() => {
        clearStoredDeadline();
        onIdle();
      }, msRemaining);

      // Recomputes secondsRemaining from the actual target timestamp
      // (never from a naive decrementing counter) so a throttled/
      // backgrounded tab catches back up to the true remaining time the
      // instant it's visible again, instead of drifting.
      tickIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((targetTimeRef.current - Date.now()) / 1000));
        setSecondsRemaining(remaining);
      }, 1000);
    },
    [onIdle]
  );

  /**
   * extendDeadline
   * The ONLY function allowed to push the logout time further into the
   * future — called exclusively by a tracked activity event, never by
   * a plain mount/remount.
   */
  const extendDeadline = useCallback(() => {
    const newDeadline = Date.now() + idleDurationMs;
    writeStoredDeadline(newDeadline);
    scheduleForDeadline(newDeadline);
  }, [idleDurationMs, scheduleForDeadline]);

  useEffect(() => {
    // Events that signal the admin is actively using the page — covers
    // mouse, keyboard-only, and touch/mobile interaction.
    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

    activityEvents.forEach((eventName) => window.addEventListener(eventName, extendDeadline));

    // On mount, use whatever deadline is already on record for this
    // tab rather than always minting a fresh one — this is what makes
    // a remount (new tab opened and switched back to, focus change,
    // etc.) a no-op instead of a 30-minute extension.
    const existingDeadline = readStoredDeadline();
    if (existingDeadline === null) {
      // Genuinely nothing on record yet — this really is a fresh
      // session on this tab, so start the full duration.
      const freshDeadline = Date.now() + idleDurationMs;
      writeStoredDeadline(freshDeadline);
      scheduleForDeadline(freshDeadline);
    } else if (existingDeadline <= Date.now()) {
      // The admin was idle past the deadline while this specific
      // component instance wasn't mounted to catch it (e.g. this tab's
      // JS was suspended). Fire the logout immediately rather than
      // silently granting another full 30 minutes.
      clearStoredDeadline();
      onIdle();
    } else {
      // A deadline is already in progress and still in the future —
      // schedule against IT, unchanged. This is the actual fix: a
      // remount lands here, not in the "mint a fresh deadline" branch.
      scheduleForDeadline(existingDeadline);
    }

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, extendDeadline));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idleDurationMs is derived
    // from the idleMinutes prop, which is always a hardcoded constant at every call site
    // (IDLE_TIMEOUT_MINUTES in both IdleTimeoutGuard and AdminHeader) — it never changes
    // across renders, so it's intentionally left out of this mount-only effect's deps.
  }, [extendDeadline, onIdle, scheduleForDeadline]);

  return secondsRemaining;
}
