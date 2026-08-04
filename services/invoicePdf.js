/**
 * FILE: services/invoicePdf.js
 * PURPOSE:
 * Renders a booking's confirmation invoice as a PDF buffer, using
 * pdf-lib (Rule: new dependency, per villa-azure-ai-insight-and-
 * directions-plan.txt Part 2 — this project had no PDF-generation
 * library before). The invoice's whole reason for existing is to carry
 * the booking's `referenceCode` (services/referenceCode.js) — that code
 * is what unlocks the gated "How to Get There" directions widget later.
 *
 * pdf-lib was chosen over @react-pdf/renderer because the invoice layout
 * here is a single simple page (no JSX component tree needed) and
 * pdf-lib has zero React/JSX runtime overhead — a better fit for a
 * one-shot server-side buffer generated inside a Next.js route handler.
 *
 * Also embeds a small location map (Static Maps API PNG, via services/
 * directions.js) — ALWAYS the plain resort pin, never a guessed route.
 *
 * Earlier version of this file also tried to draw an approximate
 * driving ROUTE here, guessed from the downloader's IP-resolved
 * city-level location (services/geoip.js). That guessed route almost
 * never matched the REAL route a guest later sees on the gated
 * /visitor/directions page (app/api/directions/compute/route.js),
 * because that page computes its route from the guest's actual browser
 * geolocation or typed address — a different, more accurate origin —
 * and caches the result as a separate PNG in Cloudflare R2
 * ("directions/<bookingId>.png"). Two different origins meant two
 * different maps for the same booking, which was confusing rather than
 * helpful. This file now ONLY renders the resort's own fixed pin (same
 * image every time, for every booking, with the same coordinates) and
 * instead points the guest at the real, accurate, gated directions page
 * below — see the "Getting There" section for the link + instructions.
 *
 * Server-side only — never import this in a "use client" file.
 */
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { getResortLocationMapImage } from "./directions";
import { buildMessengerLink } from "@/utils/messagingLinks";

// Falls back to a placeholder only if NEXT_PUBLIC_SITE_URL was never
// configured — the link still renders (never blocks PDF generation),
// it just won't be clickable/correct until the env var is set.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain-here.com").replace(/\/$/, "");

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

// NOTE: Do NOT use Intl.NumberFormat's `currency: "PHP"` style here — it
// renders the ₱ symbol (U+20B1), which StandardFonts.Helvetica cannot
// encode (WinAnsi has no ₱ glyph) and throws "WinAnsi cannot encode".
// "PHP" prefix is used instead so any Standard font can render it safely.
const PESO_NUMBER = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const PESO = { format: (value) => `PHP ${PESO_NUMBER.format(value)}` };
const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * drawWatermark
 * Draws large, diagonal, semi-transparent text centered on the page.
 *
 * pdf-lib rotates a drawn text run around its (x, y) anchor — the
 * BOTTOM-LEFT of the baseline, not the text's visual center — so
 * naively centering x/y before rotating leaves the rotated text
 * offset well away from where it looks centered (this is why the
 * previous version rendered small/off-position). This helper instead
 * solves for the anchor point that puts the text's true visual
 * center at (centerX, centerY) AFTER rotation, using standard 2D
 * rotation math.
 *
 * Also called LAST (after the map image and every other element) so
 * the watermark paints on top of everything — otherwise the opaque
 * map image fully covers whatever low-opacity text sits behind it in
 * that region, making the watermark look broken/partial rather than
 * one continuous stamp across the whole page.
 */
function drawWatermark(page, text, { font, size, color, opacity, angleDegrees, centerX, centerY }) {
  const textWidth = font.widthOfTextAtSize(text, size);
  // Approximate visual half-height above the baseline for a bold
  // all-caps run — close enough for a diagonal background stamp.
  const textHalfHeight = size * 0.35;

  const angleRad = (angleDegrees * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Offset from the baseline anchor to the text's visual center,
  // rotated by the same angle the text itself will be rotated by.
  const rotatedOffsetX = (textWidth / 2) * cosA - textHalfHeight * sinA;
  const rotatedOffsetY = (textWidth / 2) * sinA + textHalfHeight * cosA;

  page.drawText(text, {
    x: centerX - rotatedOffsetX,
    y: centerY - rotatedOffsetY,
    size,
    font,
    color,
    opacity,
    rotate: degrees(angleDegrees),
  });
}

/**
 * hexToRgb01
 * Converts a "#rrggbb" hex string to pdf-lib's rgb(), which expects
 * each channel as a 0-1 float rather than 0-255. Re-validates the hex
 * shape itself (same pattern as services/bookingConfirmationEmail.js)
 * since this value came from the database — a malformed stored value
 * must never throw mid-PDF-generation and must never silently render
 * as black text instead of falling back to the site's real default.
 */
function hexToRgb01(hexColor) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hexColor ?? "")) return null;
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

/**
 * generateInvoicePdf
 * Builds and returns the invoice as a Buffer, ready to attach to an
 * email or stream back as a file download.
 *
 * @param {object} booking - a Prisma Booking row, with `room` included
 *   (roomName may be null for tour bookings without a room)
 * @param {object} [location] - { resortLatitude, resortLongitude,
 *   resortMessengerUsername, resortName, brandAccentColor }. The first
 *   two, present → the resort pin map + directions link section is
 *   embedded below Stay Details; absent → that section is skipped
 *   entirely. resortName/brandAccentColor come from SystemSettings
 *   (siteTitle/brandAccentColor, set once in the setup wizard's
 *   Branding step) — both optional, falling back to the site's
 *   original defaults below if the singleton row is somehow missing.
 * @param {string[]} [packageInclusions] - display-ready strings (already
 *   resolved from the matching BookingRule's amenities/products/free-text
 *   by the route handler — this file stays DB-free). Empty/omitted →
 *   the "Included in this Package" section is skipped entirely.
 */
export async function generateInvoicePdf(booking, location = {}, packageInclusions = []) {
  const {
    resortLatitude = null,
    resortLongitude = null,
    resortMessengerUsername = null,
    resortName = null,
    brandAccentColor = null,
  } = location;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Falls back to the site's original green if brandAccentColor is
  // missing/malformed — see hexToRgb01 above.
  const ACCENT = hexToRgb01(brandAccentColor) ?? rgb(0.13, 0.55, 0.13);
  const MUTED = rgb(0.4, 0.4, 0.4);
  const INK = rgb(0.05, 0.05, 0.06);

  let cursorY = PAGE_HEIGHT - MARGIN;

  /**
   * writeLine
   * Small helper so the layout below reads as a sequence of lines
   * instead of repeating page.drawText's x/y math everywhere.
   */
  function writeLine(text, { font = fontRegular, size = 11, color = INK, gap = 18 } = {}) {
    page.drawText(text, { x: MARGIN, y: cursorY, size, font, color });
    cursorY -= gap;
  }

  // --- Header ---
  writeLine((resortName || "your-private-resort").toUpperCase(), { font: fontBold, size: 20, color: ACCENT, gap: 26 });
  writeLine("Booking Invoice", { font: fontBold, size: 13, gap: 24 });

  // --- Reference code — the whole point of this document ---
  page.drawRectangle({
    x: MARGIN,
    y: cursorY - 34,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 44,
    color: rgb(0.95, 0.98, 0.95),
    borderColor: ACCENT,
    borderWidth: 1,
  });
  page.drawText("REFERENCE CODE", { x: MARGIN + 12, y: cursorY - 4, size: 9, font: fontBold, color: MUTED });
  page.drawText(booking.referenceCode, {
    x: MARGIN + 12,
    y: cursorY - 22,
    size: 16,
    font: fontBold,
    color: ACCENT,
  });
  cursorY -= 56;
  writeLine("Keep this code — you'll need it to unlock turn-by-turn directions to the resort", {
    size: 9,
    color: MUTED,
    gap: 28,
  });

  // --- Next Step: Confirm on Messenger — only shown while this
  // invoice is still "pending" (no PayMongo integration yet, so the
  // owner manually reviews and confirms every booking). Guides the
  // guest to send THIS PDF (with its PENDING watermark, drawn last
  // below) to the resort's Facebook Page so the owner can approve it
  // from Super-Admin > Bookings, matching the flow in
  // app/api/admin/bookings/[id]/confirm/route.js. Skipped entirely
  // once status flips to "confirmed"/"cancelled"/"expired". ---
  if (booking.status === "pending") {
    const messengerLink = buildMessengerLink(resortMessengerUsername);
    writeLine("Next Step: Confirm Your Booking", { font: fontBold, size: 12, color: rgb(0.85, 0.55, 0.1), gap: 20 });
    writeLine("This is not yet a confirmed reservation.", { size: 10, gap: 15 });
    writeLine("1. Save or screenshot this PDF (it shows a PENDING watermark).", { size: 9, gap: 14 });
    writeLine("2. Send it to us on Facebook Messenger using the link below.", { size: 9, gap: 14 });
    if (messengerLink) {
      writeLine(messengerLink, { size: 9, color: ACCENT, gap: 18 });
    } else {
      writeLine("Facebook Messenger link not yet set up — please contact us directly.", {
        size: 9,
        color: MUTED,
        gap: 18,
      });
    }
    writeLine("3. We'll confirm your booking once we've reviewed it with you there.", { size: 9, gap: 26 });
  }

  // --- Guest & stay details ---
  writeLine("Guest Information", { font: fontBold, size: 12, gap: 20 });
  writeLine(`Name: ${booking.guestName}`);
  writeLine(`Email: ${booking.guestEmail}`);
  writeLine(`Phone: ${booking.guestPhone}`, { gap: 26 });

  writeLine("Stay Details", { font: fontBold, size: 12, gap: 20 });
  if (booking.room?.name) writeLine(`Room / Villa: ${booking.room.name}`);
  writeLine(`Booking type: ${booking.bookingType.replace("_", " ")}`);
  writeLine(`Check-in: ${FULL_DATE.format(new Date(booking.checkInDate))}`);
  writeLine(`Check-out: ${FULL_DATE.format(new Date(booking.checkOutDate))}`);
  writeLine(`Guests: ${booking.numberOfGuests}`, { gap: 26 });

  // --- Included in this Package — free-text extras + resolved Amenity/
  // StoreProduct names, passed in already-resolved (see JSDoc above).
  // Skipped entirely when the matching BookingRule has nothing listed,
  // so bookings under a bare-bones rule set don't show an empty
  // section header with nothing under it. ---
  if (packageInclusions.length > 0) {
    writeLine("Included in this Package", { font: fontBold, size: 12, gap: 20 });
    for (const inclusion of packageInclusions) {
      writeLine(`• ${inclusion}`, { size: 10, gap: 15 });
    }
    cursorY -= 8;
  }

  // --- Location map: always the resort's own fixed pin — never a
  // guessed route, so this section renders identically for every
  // booking and never conflicts with the real route image the guest
  // later sees (and which gets cached to R2) on /visitor/directions. ---
  if (resortLatitude && resortLongitude) {
    writeLine("Getting There", { font: fontBold, size: 12, gap: 20 });

    const mapImageBuffer = await getResortLocationMapImage(resortLatitude, resortLongitude).catch(() => null);

    if (mapImageBuffer) {
      const mapImage = await pdfDoc.embedPng(mapImageBuffer);
      // Pin-only images are requested at 480x320 (3:2) — displayed
      // width stays fixed, height follows the aspect ratio.
      const mapWidth = 240;
      const mapHeight = 160;
      page.drawImage(mapImage, { x: MARGIN, y: cursorY - mapHeight, width: mapWidth, height: mapHeight });
      cursorY -= mapHeight + 20;
    } else {
      writeLine("Map unavailable — see your confirmation email for the resort's exact location.", {
        size: 9,
        color: MUTED,
        gap: 20,
      });
    }

    // --- Turn-by-turn directions link — the real, accurate route (from
    // the guest's actual location, not a guess) lives on this gated
    // page instead, unlocked with the reference code above. ---
    writeLine("Get turn-by-turn driving directions:", { font: fontBold, size: 10, gap: 15 });
    writeLine(`${SITE_URL}/visitor/directions`, { size: 10, color: ACCENT, gap: 18 });
    writeLine("How it works:", { font: fontBold, size: 9, gap: 14 });
    writeLine("1. Visit the link above starting one day before your check-in date.", { size: 9, gap: 14 });
    writeLine(`2. Enter your reference code (${booking.referenceCode}) when prompted.`, { size: 9, gap: 14 });
    writeLine("3. Share your location (or type your address) to get your personalized route.", {
      size: 9,
      gap: 26,
    });
  }

  writeLine("Payment Summary", { font: fontBold, size: 12, gap: 20 });
  writeLine(`Total amount: ${PESO.format(Number(booking.totalAmount))}`);
  if (Number(booking.depositAmount) > 0) {
    writeLine(`Deposit due: ${PESO.format(Number(booking.depositAmount))}`);
  }
  writeLine(`Status: ${booking.status}`, { gap: 26 });

  writeLine(`Issued: ${FULL_DATE.format(new Date())}`, { size: 9, color: MUTED });

  // --- Watermark — drawn LAST so it sits on top of every other
  // element, including the map image (see drawWatermark's comment for
  // why). Priority: CANCELLED > EXPIRED > PENDING > REBOOK > CONFIRMED
  // — a cancelled booking always shows CANCELLED even if it was
  // rebooked before it was later cancelled. PENDING marks an invoice
  // the guest is meant to screenshot/show on Messenger BEFORE the
  // owner has approved it (Rule: no PayMongo integration yet — see
  // app/api/bookings/route.js and app/api/admin/bookings/[id]/confirm/
  // route.js) so it's visually unmistakable that this is not yet a
  // confirmed reservation. EXPIRED marks one the owner never
  // confirmed within the 8-hour hold window (see
  // Booking.pendingExpiresAt / app/api/cron/booking-expiry/route.js).
  // Otherwise a booking moved via the self-service Rebook flow
  // (rebookedAt set — see schema comment on Booking.rebookedAt) shows
  // REBOOK so staff and the guest can see at a glance this invoice
  // reflects moved dates, not the original booking. Sized relative to
  // the page so it reads clearly at a glance without a print, and
  // opacity is high enough to stay legible over the map image while
  // still reading as a background stamp. ---
  const watermarkText =
    booking.status === "cancelled"
      ? "CANCELLED"
      : booking.status === "expired"
        ? "EXPIRED"
        : booking.status === "pending"
          ? "PENDING"
          : booking.rebookedAt
            ? "REBOOK"
            : "CONFIRMED";
  const watermarkColor =
    booking.status === "cancelled" || booking.status === "expired"
      ? rgb(0.75, 0.15, 0.15)
      : booking.status === "pending"
        ? rgb(0.85, 0.55, 0.1)
        : ACCENT;
  drawWatermark(page, watermarkText, {
    font: fontBold,
    size: 108,
    color: watermarkColor,
    opacity: 0.16,
    angleDegrees: 35,
    centerX: PAGE_WIDTH / 2,
    centerY: PAGE_HEIGHT / 2,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}