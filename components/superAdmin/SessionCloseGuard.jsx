/**
 * FILE: components/superAdmin/SessionCloseGuard.jsx
 * ROLE: Super-admin only — mounted inside the authenticated shell
 *
 * PURPOSE:
 * Automatically signs the admin out once the LAST open admin tab is
 * closed, instead of leaving the 7-day session cookie valid on a
 * device the admin has walked away from. Works alongside the
 * idle-timeout pattern — this covers the "closed the tab/browser"
 * case, idle timeout covers the "left it open and unused" case.
 *
 * BUG FIXED (multi-tab false logout):
 * The session cookie is shared by every tab pointed at the admin area.
 * The previous version fired the logout beacon on ANY "pagehide" —
 * which meant closing just ONE of several open admin tabs, or even a
 * plain refresh (F5), killed the session cookie out from under every
 * OTHER tab still actively in use (SessionExpiryGuard's 401
 * interceptor or wake-recheck would then force those tabs to /login
 * too). Fixed by tracking how many admin tabs are currently open (via
 * a shared localStorage registry, since localStorage — unlike
 * sessionStorage — is visible across tabs of the same origin) and
 * only sending the logout beacon when THIS tab is the last one left.
 *
 * DATA FLOW:
 * 1. Mounted once inside app/superAdmin/(protected)/layout.jsx
 * 2. On mount: this tab gets a stable ID (kept in sessionStorage, so a
 *    same-tab refresh reuses the same ID instead of registering as a
 *    "new" tab) and writes a heartbeat timestamp for that ID into a
 *    shared localStorage registry. A short interval refreshes that
 *    heartbeat so a crashed/unresponsive tab's stale entry ages out.
 * 3. On "pagehide": if the event is a bfcache suspend (back/forward
 *    navigation — event.persisted === true), the tab isn't actually
 *    closing, so this does nothing at all. Otherwise it removes this
 *    tab's own entry from the registry, then checks whether any OTHER
 *    entry still has a fresh (non-stale) heartbeat. Only when none do
 *    — meaning this really was the last open admin tab — does it fire
 *    navigator.sendBeacon(...) to POST /api/auth/logout. sendBeacon is
 *    used specifically because a normal fetch() gets cancelled
 *    mid-flight the instant the tab actually closes, while sendBeacon
 *    is guaranteed by the browser to still go out.
 * 4. The next request from that browser (if any) has no valid session
 *    cookie left, so middleware.js sends it straight back to
 *    /superAdmin/login
 *
 * NOTE: A manual refresh (F5) on a SINGLE open admin tab still signs
 * the admin out — with only one tab registered, it always counts as
 * "the last tab" the instant it unloads. That single-tab case remains
 * the accepted trade-off for a hard "closing my only tab logs me out"
 * guarantee; what's fixed here is the multi-tab false-logout case,
 * which was unintentional.
 */
"use client";

import { useEffect } from "react";

const TAB_REGISTRY_KEY = "villaAzureAdminOpenTabs";
const TAB_ID_STORAGE_KEY = "villaAzureAdminTabId";
const HEARTBEAT_INTERVAL_MS = 5000;
const STALE_TAB_THRESHOLD_MS = 15000; // A tab that crashed without cleaning up ages out after this long

/**
 * getOrCreateTabId
 * Reuses the same tab ID across a refresh (sessionStorage survives
 * reload but not a real close/new tab), so a refresh never looks like
 * a brand-new tab joining the registry.
 */
function getOrCreateTabId() {
  let tabId = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
  if (!tabId) {
    tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabId);
  }
  return tabId;
}

/**
 * readRegistry / writeRegistry
 * The shared cross-tab registry: { [tabId]: lastHeartbeatTimestamp }.
 * Wrapped in try/catch — a full or blocked localStorage must never
 * crash the admin panel, it just degrades to "always logout on close".
 */
function readRegistry() {
  try {
    return JSON.parse(localStorage.getItem(TAB_REGISTRY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeRegistry(registry) {
  try {
    localStorage.setItem(TAB_REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // Ignore — worst case this tab is invisible to the others and
    // logout fires a little too eagerly, never too late.
  }
}

export default function SessionCloseGuard() {
  useEffect(() => {
    const tabId = getOrCreateTabId();

    // Register this tab immediately, then refresh the heartbeat on an
    // interval so other tabs can tell this one is still alive.
    function sendHeartbeat() {
      const registry = readRegistry();
      registry[tabId] = Date.now();
      writeRegistry(registry);
    }
    sendHeartbeat();
    const heartbeatIntervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    /**
     * isLastRemainingTab
     * Removes this tab's own entry, then checks whether any OTHER
     * entry still has a fresh (non-stale) heartbeat. If none do, this
     * genuinely was the last admin tab open.
     */
    function isLastRemainingTab() {
      const registry = readRegistry();
      delete registry[tabId];
      writeRegistry(registry);

      const now = Date.now();
      return !Object.values(registry).some(
        (lastHeartbeat) => now - lastHeartbeat < STALE_TAB_THRESHOLD_MS
      );
    }

    function handlePageHide(event) {
      // The page is being suspended into the back/forward cache (the
      // admin navigated away and may navigate right back) — not
      // actually closing, so never treat this as a close.
      if (event.persisted) return;

      if (isLastRemainingTab()) {
        // No request body needed — the logout route only reads the
        // session cookie, which the browser attaches to the beacon
        // request automatically since it's same-origin.
        navigator.sendBeacon("/api/auth/logout");
      }
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      clearInterval(heartbeatIntervalId);
      window.removeEventListener("pagehide", handlePageHide);
      // Normal unmount (e.g. React StrictMode/HMR in dev) — not a real
      // tab close, so just remove this tab's heartbeat quietly rather
      // than risk logging anyone out.
      const registry = readRegistry();
      delete registry[tabId];
      writeRegistry(registry);
    };
  }, []);

  return null;
}
