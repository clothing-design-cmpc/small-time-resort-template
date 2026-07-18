/**
 * FILE: hooks/useLogoutOnHidden.js
 * PURPOSE:
 * Fires onHidden the instant the page becomes hidden — covers closing
 * the tab, closing the browser, AND the device going to sleep, because
 * all three cause the exact same thing from the page's point of view:
 * the browser stops giving this document any more foreground time.
 * There's no separate "device slept" event to listen for — sleep,
 * tab-close, and browser-close are indistinguishable from inside the
 * page itself, which is why one listener covers all three.
 *
 * TRADE-OFF, STATED PLAINLY:
 * This also fires on a plain tab-switch or window-minimize — anything
 * that hides the page counts, not just closing/sleeping. For a
 * disaster-recovery vault session this is the intentionally strict
 * choice (matches "close browser, close tab, or sleep = logout"
 * exactly by not trying to guess which kind of hidden it was) — but it
 * does mean alt-tabbing away and back requires re-entering the
 * passphrase + OTP, same as if the browser had actually closed.
 *
 * WHY keepalive: true INSTEAD OF navigator.sendBeacon:
 * sendBeacon only ever sends POST — this needs to hit the existing
 * DELETE /api/admin/vault-login route without adding a second
 * POST-based endpoint just for this. fetch's keepalive flag exists
 * for exactly this "let the request survive the page going away"
 * case and works with any method.
 *
 * DATA FLOW:
 * 1. Mounted inside RecoveryClient.jsx alongside useIdleTimeout — this
 *    hook handles the "page went away" case, useIdleTimeout still
 *    handles plain prolonged inactivity while the tab stays visible
 * 2. visibilitychange fires "hidden" -> onHidden() runs immediately,
 *    no debounce or delay
 * 3. If the page becomes visible again (it was a tab-switch, not an
 *    actual close), page.jsx's own server-side vaultSession check
 *    already re-validates on the next navigation/request regardless —
 *    this hook doesn't need to do anything special for that case
 */
import { useEffect } from "react";

/**
 * useLogoutOnHidden
 * @param {() => void} onHidden - Called the instant document.visibilityState becomes "hidden"
 */
export function useLogoutOnHidden(onHidden) {
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        onHidden();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [onHidden]);
}
