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
 * directions.js):
 *   - If the downloader's IP resolved to an approximate city-level
 *     location (services/geoip.js, passed in as guestLatitude/
 *     guestLongitude), shows an actual driving ROUTE from that
 *     approximate point to the resort, clearly labeled as approximate
 *     since it's IP-based, not the guest's exact address.
 *   - Otherwise (private/local IP, lookup miss, or route computation
 *     failure) falls back to a plain pin at the resort's own
 *     coordinates — the same fallback this always had.
 *
 * Server-side only — never import this in a "use client" file.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getResortLocationMapImage, getRouteMapImage, computeDrivingRoute } from "./directions";

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
 * @param {object} [location] - { resortLatitude, resortLongitude,
 *   guestLatitude, guestLongitude }, all nullable.
 *   - resortLatitude/Longitude present → a location map is embedded
 *     below Stay Details; absent → that section is skipped entirely.
 *   - guestLatitude/Longitude present (from the downloader's IP,
 *     services/geoip.js) → the map shows an approximate driving route
 *     instead of just a pin; absent/failed → falls back to the pin.
 */
export async function generateInvoicePdf(booking, location = {}) {
  const {
    resortLatitude = null,
    resortLongitude = null,
    guestLatitude = null,
    guestLongitude = null,
  } = location;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ACCENT = rgb(0.13, 0.55, 0.13); // matches the site's green accent token
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

  // --- Location map: approximate route if we have a guest origin, else a plain resort pin ---
  if (resortLatitude && resortLongitude) {
    writeLine("Getting There", { font: fontBold, size: 12, gap: 20 });

    let mapImageBuffer = null;
    let isApproximateRoute = false;

    // Only attempt a route if geoip.js resolved the downloader's IP to
    // an actual location — private/local IPs and lookup misses return
    // null here, which correctly skips straight to the pin fallback.
    if (guestLatitude && guestLongitude) {
      const origin = { latitude: guestLatitude, longitude: guestLongitude };
      const destination = { latitude: resortLatitude, longitude: resortLongitude };

      // Reuses the exact same Routes API call the gated /visitor/directions
      // page uses — errors here (e.g. Routes API hiccup) must never break
      // invoice generation, so both calls are wrapped and simply fall
      // through to the plain-pin fallback below.
      const route = await computeDrivingRoute(origin, destination).catch(() => null);
      if (route) {
        mapImageBuffer = await getRouteMapImage(origin, destination, route.encodedPolyline).catch(() => null);
        isApproximateRoute = Boolean(mapImageBuffer);
      }
    }

    if (!mapImageBuffer) {
      mapImageBuffer = await getResortLocationMapImage(resortLatitude, resortLongitude).catch(() => null);
    }

    if (mapImageBuffer) {
      const mapImage = await pdfDoc.embedPng(mapImageBuffer);
      // Route images are requested at 640x400 (8:5); pin-only images at
      // 480x320 (3:2) — displayed width stays fixed, height adjusts per
      // aspect ratio so neither ever stretches.
      const mapWidth = 240;
      const mapHeight = isApproximateRoute ? 150 : 160;
      page.drawImage(mapImage, { x: MARGIN, y: cursorY - mapHeight, width: mapWidth, height: mapHeight });
      cursorY -= mapHeight + (isApproximateRoute ? 8 : 20);

      if (isApproximateRoute) {
        writeLine("Approximate route based on your device's general location (IP address).", {
          size: 8,
          color: MUTED,
          gap: 26,
        });
        writeLine("Not your exact address — for turn-by-turn directions, use the code above on our website.", {
          size: 8,
          color: MUTED,
          gap: 26,
        });
      }
    } else {
      writeLine("Map unavailable — see your confirmation email for the resort's exact location.", {
        size: 9,
        color: MUTED,
        gap: 26,
      });
    }
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