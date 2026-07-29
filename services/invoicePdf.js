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
 * generateInvoicePdf
 * Builds and returns the invoice as a Buffer, ready to attach to an
 * email or stream back as a file download.
 *
 * @param {object} booking - a Prisma Booking row, with `room` included
 *   (roomName may be null for tour bookings without a room)
 * @param {object} [location] - { resortLatitude, resortLongitude },
 *   both nullable. Present → the resort pin map + directions link
 *   section is embedded below Stay Details; absent → that section is
 *   skipped entirely.
 * @param {string[]} [packageInclusions] - display-ready strings (already
 *   resolved from the matching BookingRule's amenities/products/free-text
 *   by the route handler — this file stays DB-free). Empty/omitted →
 *   the "Included in this Package" section is skipped entirely.
 */
export async function generateInvoicePdf(booking, location = {}, packageInclusions = []) {
  const { resortLatitude = null, resortLongitude = null } = location;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ACCENT = rgb(0.13, 0.55, 0.13); // matches the site's green accent token
  const MUTED = rgb(0.4, 0.4, 0.4);
  const INK = rgb(0.05, 0.05, 0.06);

  // --- Watermark — drawn first so every later element paints on top of
  // it. Priority: CANCELLED > REBOOK > CONFIRMED — a cancelled booking
  // always shows CANCELLED even if it was rebooked before it was later
  // cancelled; otherwise a booking that's been moved via the
  // self-service Rebook flow (rebookedAt set — see schema comment on
  // Booking.rebookedAt) shows REBOOK so staff and the guest can see at
  // a glance that this invoice reflects moved dates, not the original
  // booking. Large, low-opacity, rotated diagonally across the page —
  // standard invoice/receipt convention. ---
  const watermarkText =
    booking.status === "cancelled" ? "CANCELLED" : booking.rebookedAt ? "REBOOK" : "CONFIRMED";
  const watermarkFontSize = 72;
  const watermarkWidth = fontBold.widthOfTextAtSize(watermarkText, watermarkFontSize);
  page.drawText(watermarkText, {
    x: PAGE_WIDTH / 2 - watermarkWidth / 2,
    y: PAGE_HEIGHT / 2,
    size: watermarkFontSize,
    font: fontBold,
    color: booking.status === "cancelled" ? rgb(0.7, 0.15, 0.15) : ACCENT,
    opacity: 0.08,
    rotate: degrees(-30),
  });

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
  writeLine("VILLA AZURE RESORT", { font: fontBold, size: 20, color: ACCENT, gap: 26 });
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

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}