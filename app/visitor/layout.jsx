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
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import ScrollToTopOnLoad from "@/components/shared/ScrollToTopOnLoad";
import MaintenanceBanner from "@/components/shared/MaintenanceBanner";

/**
 * getMaintenanceStatus
 * Reads the singleton SystemSettings row directly (Server Component,
 * no separate API round-trip needed) so every visitor page load knows
 * whether to show the maintenance banner before anything else renders.
 * Fails open (returns "off") on any DB error — a broken settings read
 * must never be the reason the whole visitor site looks down.
 */
async function getMaintenanceStatus() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { maintenanceMode: true, maintenanceMessage: true },
    });
    return {
      maintenanceMode: settings?.maintenanceMode ?? false,
      maintenanceMessage: settings?.maintenanceMessage ?? "",
    };
  } catch {
    return { maintenanceMode: false, maintenanceMessage: "" };
  }
}

export default async function VisitorLayout({ children }) {
  const { maintenanceMode, maintenanceMessage } = await getMaintenanceStatus();

  return (
    <div className="visitorShell">
      {/* Ensures every page load/refresh opens on the Hero section
          instead of the browser restoring a previous scroll position */}
      <ScrollToTopOnLoad />
      {maintenanceMode && <MaintenanceBanner message={maintenanceMessage} />}
      <Header />
      {/* pt-[header height] so page content is never hidden behind the sticky header */}
      <div className="visitorContent">
        {children}
      </div>
      <Footer />
    </div>
  );
}
