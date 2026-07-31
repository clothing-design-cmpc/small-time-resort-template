/**
 * FILE: app/visitor/layout.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shell for every page under /visitor. Renders the sticky Header above
 * all content and the Footer below. The {children} slot receives each
 * individual page (homepage, rooms, booking, etc.).
 *
 * DATA FLOW:
 * 1. Every route under app/visitor/ renders inside this layout's {children}
 * 2. No session check happens here — visitor pages are public by design
 * 3. Header and Footer are rendered once, shared across all visitor pages
 */
import "./Visitor.css";
import { prisma } from "@/services/prisma";
import { isScheduledLockdownActive } from "@/services/scheduledLockdown";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import ScrollToTopOnLoad from "@/components/shared/ScrollToTopOnLoad";
import MaintenanceBanner from "@/components/shared/MaintenanceBanner";
import BreachLockdownScreen from "@/components/shared/BreachLockdownScreen";
import MaintenanceLockdownScreen from "@/components/shared/MaintenanceLockdownScreen";
import ScheduledMaintenanceIcon from "@/components/shared/ScheduledMaintenanceIcon";
import WalkInChatWidget from "@/components/shared/WalkInChatWidget";
import ManageBookingWidget from "@/components/shared/ManageBookingWidget";
import ResortLocationWidget from "@/components/shared/ResortLocationWidget";

// Forces this layout to always re-run getMaintenanceStatus() on every
// request instead of being statically cached (Next.js's default for a
// Server Component with no cookies()/headers()/fetch() call to signal
// "dynamic"). Without this, the first render could get cached and every
// later visitor page load — even after a lockdown is lifted and the DB
// row changes — would keep serving that same stale locked/unlocked state.
export const dynamic = "force-dynamic";

/**
 * getMaintenanceStatus
 * Reads the singleton SystemSettings row directly (Server Component,
 * no separate API round-trip needed) so every visitor page load knows
 * whether to show the maintenance banner — or, for an active breach or
 * a completed database wipe, the full-page takeover — before anything
 * else renders. Fails open (returns "off") on any DB error — a broken
 * settings read must never be the reason the whole visitor site looks
 * down.
 */
async function getMaintenanceStatus() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: {
        maintenanceMode: true,
        maintenanceMessage: true,
        breachLockdown: true,
        postWipeLockdown: true,
        breachActiveEventId: true,
      },
    });

    // Which gatekeeper caused the active lockdown, if any — read from the
    // linked BreachEvent row so BreachLockdownScreen can show
    // gatekeeper-specific content (Gatekeeper 2 gets its own message).
    let activeGatekeeper = null;
    if (settings?.breachActiveEventId) {
      const breachEvent = await prisma.breachEvent.findUnique({
        where: { id: settings.breachActiveEventId },
        select: { gatekeeper: true },
      });
      activeGatekeeper = breachEvent?.gatekeeper ?? null;
    }

    return {
      maintenanceMode: settings?.maintenanceMode ?? false,
      maintenanceMessage: settings?.maintenanceMessage ?? "",
      breachLockdown: settings?.breachLockdown ?? false,
      postWipeLockdown: settings?.postWipeLockdown ?? false,
      activeGatekeeper,
    };
  } catch {
    return {
      maintenanceMode: false,
      maintenanceMessage: "",
      breachLockdown: false,
      postWipeLockdown: false,
      activeGatekeeper: null,
    };
  }
}

/**
 * getMessageUsChannels
 * Reads only the 3 optional Message Us fields off the singleton
 * SystemSettings row (Super-Admin > Policies & Content > Contact Info)
 * so WalkInChatWidget can show a WhatsApp/Viber/Messenger button for
 * each one the admin has filled in. Fails to all-null on any DB error
 * — WalkInChatWidget already treats "no channels configured" as normal
 * (the callback form still renders on its own either way).
 */
async function getMessageUsChannels() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { resortWhatsapp: true, resortViber: true, resortMessengerUsername: true },
    });
    return {
      whatsapp: settings?.resortWhatsapp ?? null,
      viber: settings?.resortViber ?? null,
      messengerUsername: settings?.resortMessengerUsername ?? null,
    };
  } catch (error) {
    // Logged (not silent) so a schema mismatch or DB hiccup here is
    // visible in the dev server terminal instead of just quietly
    // showing zero Message Us buttons with no clue why.
    console.error("[VisitorLayout] Failed to read Message Us channels:", error.message);
    return { whatsapp: null, viber: null, messengerUsername: null };
  }
}

/**
 * getBrandName
 * Reads only the siteTitle field off the singleton SystemSettings row
 * (Super-Admin > Content > Homepage > Brand Identity) so Header — a
 * Client Component, which can't fetch Prisma directly — always gets
 * the resort's current display name as a prop. Falls back to the
 * original placeholder on any DB error, same fail-safe pattern as
 * getMaintenanceStatus/getMessageUsChannels above.
 */
async function getBrandName() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { siteTitle: true },
    });
    return settings?.siteTitle || "your-private-resort";
  } catch {
    return "your-private-resort";
  }
}

export default async function VisitorLayout({ children }) {
  const { maintenanceMode, maintenanceMessage, breachLockdown, postWipeLockdown, activeGatekeeper } =
    await getMaintenanceStatus();
  const messageUsChannels = await getMessageUsChannels();
  const resortName = await getBrandName();

  // A completed database wipe (Task 2) is the most severe case of all —
  // proxy.js already redirects every visitor request to /maintenance
  // before this layout would even render, but this check stays here as
  // a second line of defense for any render path that skips proxy.js.
  if (postWipeLockdown) {
    return <MaintenanceLockdownScreen message={maintenanceMessage} />;
  }

  // A breach is more severe than plain planned maintenance — the
  // database itself may be compromised, so nothing else on the visitor
  // side renders at all (no Header, no Footer, no page content), not
  // even a banner over an otherwise-working site.
  if (breachLockdown) {
    return <BreachLockdownScreen message={maintenanceMessage} gatekeeper={activeGatekeeper} />;
  }

  // Scheduled nightly window (default 2:00-3:00 AM PHT) — proxy.js
  // already redirects here first for every request that hits it, but
  // this stays as a second line of defense for any render path that
  // skips proxy.js, same reasoning as the postWipeLockdown check above.
  if (isScheduledLockdownActive()) {
    return <MaintenanceLockdownScreen message="This website is briefly unavailable for scheduled nightly maintenance. Please check back shortly." />;
  }

  return (
    <div className="visitorShell">
      {/* Ensures every page load/refresh opens on the Hero section
          instead of the browser restoring a previous scroll position */}
      <ScrollToTopOnLoad />
      {maintenanceMode && <MaintenanceBanner message={maintenanceMessage} />}
      <Header resortName={resortName} />
      {/* pt-[header height] so page content is never hidden behind the sticky header */}
      <div className="visitorContent">
        {children}
      </div>
      <Footer />
      {/* Floating "request a callback" icon — walk-in/phone-in lead capture (audit item #11/#12) */}
      <WalkInChatWidget
        whatsapp={messageUsChannels.whatsapp}
        viber={messageUsChannels.viber}
        messengerUsername={messageUsChannels.messengerUsername}
      />
      {/* Floating "manage/cancel my booking" icon — stacked directly above WalkInChatWidget's button */}
      <ManageBookingWidget />
      {/* Floating "resort location" icon — stacked directly above ManageBookingWidget's button */}
      <ResortLocationWidget />
      {/* Floating scheduled-maintenance heads-up icon — bottom-left, paired with WalkInChatWidget's bottom-right */}
      <ScheduledMaintenanceIcon />
    </div>
  );
}
