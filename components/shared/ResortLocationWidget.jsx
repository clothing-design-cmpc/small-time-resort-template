/**
 * FILE: components/shared/ResortLocationWidget.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Floating "Location" icon fixed above ManageBookingWidget's icon
 * (same right edge, stacked one slot higher). Lets a guest see the
 * resort's exact address and a pin map without scrolling down to the
 * footer. This file is a Server Component so it can read the resort's
 * address/coordinates directly from the database — the actual
 * interactive button + modal live in ResortLocationWidgetClient.jsx
 * ("use client"), which this component renders with those values as
 * props (same split pattern Footer.jsx uses for ResortLocationMap).
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/layout.jsx, directly above
 *    <ManageBookingWidget />
 * 2. Server Component reads the singleton SystemSettings row via
 *    Prisma (same pattern as Footer.jsx / About.jsx) — resortAddress /
 *    resortLatitude / resortLongitude are editable by the super-admin
 *    under Content > Policies & Content > Contact Info
 * 3. Falls back to the same placeholder address and Metro Manila
 *    coordinates as Footer.jsx if the admin hasn't filled these in
 *    yet, so the widget is never blank or broken
 * 4. Passes the resolved values down to ResortLocationWidgetClient,
 *    which renders the floating button and the click-to-open modal
 */
import { prisma } from "@/services/prisma";
import ResortLocationWidgetClient from "./ResortLocationWidgetClient";

// Same placeholder used by Footer.jsx — keeps both location surfaces
// consistent until the admin sets the real address.
const PLACEHOLDER_ADDRESS = "Philippines";

export default async function ResortLocationWidget() {
  // .catch(() => null) means a DB hiccup falls back to placeholders
  // instead of breaking this widget (and therefore every visitor page).
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const resortAddress = settings?.resortAddress || PLACEHOLDER_ADDRESS;

  // Schema-level @default() means these are only null if a row exists
  // but someone explicitly cleared the fields — fall back to the same
  // Metro Manila placeholder coordinates Footer.jsx uses so the map
  // inside the modal always has something to render.
  const resortLatitude = settings?.resortLatitude ?? 14.5995;
  const resortLongitude = settings?.resortLongitude ?? 120.9842;

  return (
    <ResortLocationWidgetClient
      address={resortAddress}
      latitude={resortLatitude}
      longitude={resortLongitude}
      resortName="your-private-resort"
    />
  );
}
