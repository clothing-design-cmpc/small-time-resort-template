/**
 * FILE: components/superAdmin/SessionExpiryGuard.jsx
 * ROLE: Super-admin only — mounted inside the authenticated shell
 *
 * PURPOSE:
 * Fixes the "ghost session" bug: once the session cookie is no longer
 * valid (idle timeout already fired in another tab, SessionCloseGuard's
 * beacon cleared it on a refresh, the 7-day cookie actually expired,
 * etc.), the admin was left sitting on a fully-rendered page where every
 * data fetch just failed with a silent 401 and a generic "We couldn't
 * load this data" message — never redirected back to /login. This
 * component makes an invalid session end the admin's screen time
 * immediately, from two directions:
 *
 * 1. GLOBAL 401 INTERCEPTOR — axios is a singleton module, so attaching
 *    one response interceptor here applies to every axios.get/post call
 *    made anywhere in the admin area, without having to touch every
 *    individual page/component file. The first 401 from any
 *    /api/superAdmin or /api/admin request forces an immediate sign-out
 *    redirect instead of leaving the failed call's own component to
 *    show an error state.
 * 2. WAKE / FOCUS RE-CHECK — 'visibilitychange' fires the instant a
 *    sleeping device wakes back up or the admin switches back to this
 *    tab. On that event, a lightweight GET /api/superAdmin/me confirms
 *    the session is still valid RIGHT AWAY, rather than waiting for the
 *    admin to click something and stumble into the same silent-401 bug.
 *
 * DATA FLOW:
 * 1. Mounted once inside app/superAdmin/(protected)/layout.jsx
 * 2. Interceptor + visibilitychange listener registered on mount, torn
 *    down on unmount
 * 3. Either trigger calls the same forceSessionExpiredLogout(): POST
 *    /api/auth/logout to clear whatever's left of the cookie, then hard
 *    redirect (not router.push) to /superAdmin/login?reason=session-expired
 *    — a hard redirect is used deliberately so it always wins even if
 *    fired from deep inside a rejected promise chain the router isn't
 *    expecting
 */
"use client";

import { useEffect, useRef } from "react";
import axios from "axios";

const ADMIN_API_PREFIXES = ["/api/superAdmin", "/api/admin"];

/**
 * isAdminApiRequest
 * Only admin-area calls should trigger a forced admin logout — a 401
 * from some unrelated request (if any is ever added to this axios
 * singleton later) must never bounce the admin out of their session.
 */
function isAdminApiRequest(url) {
  if (typeof url !== "string") return false;
  return ADMIN_API_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export default function SessionExpiryGuard() {
  // Guards against firing the redirect twice (e.g. several requests
  // 401 in the same tick, or a 401 arrives right as visibilitychange
  // also fires) — only the first one actually needs to act.
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    /**
     * forceSessionExpiredLogout
     * Clears whatever's left of the session cookie server-side, then
     * hard-redirects to the login page with an explanatory reason. Idempotent
     * — safe to call from multiple triggers, only the first call does anything.
     */
    async function forceSessionExpiredLogout() {
      if (hasTriggeredRef.current) return;
      hasTriggeredRef.current = true;

      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Ignore — the cookie may already be gone; either way we still
        // need to send the admin back to /login.
      } finally {
        window.location.href = "/superAdmin/login?reason=session-expired";
      }
    }

    // --- Trigger 1: any admin API call coming back 401 ---
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status;
        const requestUrl = error?.config?.url;
        if (status === 401 && isAdminApiRequest(requestUrl)) {
          forceSessionExpiredLogout();
        }
        // Re-throw so the calling component's own .catch() still runs
        // its normal error-state handling for every OTHER failure.
        return Promise.reject(error);
      }
    );

    // --- Trigger 2: tab/device regains visibility — covers device sleep ---
    // A device going to sleep with the tab open doesn't fire any of the
    // idle-timeout's tracked activity events, but it also doesn't fire
    // any API calls to surface a 401 either — nothing happens until the
    // device wakes up. 'visibilitychange' is the signal that moment
    // arrived, so this is where a stale session actually gets caught.
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      axios.get("/api/superAdmin/me").catch((error) => {
        if (error?.response?.status === 401) {
          forceSessionExpiredLogout();
        }
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      axios.interceptors.response.eject(interceptorId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
