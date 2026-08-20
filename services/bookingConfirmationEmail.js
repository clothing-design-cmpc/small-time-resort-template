/**
 * FILE: services/bookingConfirmationEmail.js
 * PURPOSE:
 * Sends the automatic email a guest receives the moment their booking
 * flips from "pending" to "confirmed" (app/api/admin/bookings/[id]/
 * confirm/route.js). Reuses the existing generic EmailJS "Contact
 * template" via sendGeneralEmail() — no new EmailJS dashboard template
 * or env var is required, since that template already renders
 * body_message as raw HTML ({{{body_message}}}).
 *
 * DATA FLOW:
 * 1. Confirm route calls sendBookingConfirmationEmail({ booking })
 * 2. This file fetches the admin-editable copy + attached images from
 *    the BookingConfirmationEmail singleton (get-or-create, same
 *    pattern as SystemSettings)
 * 3. Resort rules text is pulled LIVE from SystemSettings.houseRules —
 *    never copied/duplicated here — falling back to
 *    utils/defaultHouseRules.js when the admin hasn't set any yet,
 *    same fallback the visitor Policies page uses
 * 4. Everything is assembled into one HTML string (booking details
 *    box, uploaded images, resort rules list, admin copy) and handed
 *    to sendGeneralEmail() as bodyMessage
 *
 * Server-side only — never import this in a "use client" file.
 */

import { prisma } from "./prisma.js";
import { sendGeneralEmail } from "./emailjs.js";
import { DEFAULT_HOUSE_RULES } from "@/utils/defaultHouseRules";

// Formats an effectiveCheckInAt/effectiveCheckOutAt ISO moment (Sequential
// Auto-Adjust — see services/bookingPricing.js) into a full date + time,
// same wording/shape as app/visitor/booking/ReservationSummaryClient.jsx's
// own FULL_DATE_TIME, just en-PH locale to match this file's other dates.
const FULL_DATE_TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * escapeHtml
 * Minimal HTML-escaping for guest-supplied and admin-supplied plain
 * text fields before they're interpolated into the raw HTML body —
 * prevents a stray "<" or "&" from breaking the email's markup (Rule
 * 18.3's XSS-prevention principle, applied to outbound HTML instead
 * of a rendered DOM).
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * mixHexWithWhite
 * Lightens a validated #rrggbb hex color toward white by `amount`
 * (0-1) — used to derive a readable "muted"/secondary text shade from
 * brandTextColor for this specific light-background email, instead of
 * the old rgba(255,255,255,X) values that assumed a dark background
 * and were nearly invisible against the cream brandBackgroundColor.
 */
function mixHexWithWhite(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * renderParagraphs
 * Splits admin-edited plain text on blank lines into <p> blocks —
 * same blank-line convention as the visitor Policies page's
 * renderTextBlock(), just emitting HTML instead of JSX.
 */
function renderParagraphs(text, textColor) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => `<p style="margin:0 0 14px;color:${textColor};">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/**
 * renderResortRulesList
 * Builds the <ol> of resort rules from whichever text is live right
 * now — admin-saved SystemSettings.houseRules if present, otherwise
 * the same default list shown on the visitor Policies page. Rules are
 * split the same way renderTextBlock() splits them for that page
 * (blank-line-separated items).
 */
function renderResortRulesList(houseRulesText, textColor) {
  const trimmed = (houseRulesText ?? "").trim();
  const rules = trimmed
    ? trimmed.split(/\n\s*\n/).map((rule) => rule.trim()).filter(Boolean)
    : DEFAULT_HOUSE_RULES;

  const items = rules
    .map((rule) => `<li style="margin:0 0 8px;color:${textColor};">${escapeHtml(rule)}</li>`)
    .join("");
  return `<ol style="margin:0;padding-left:20px;">${items}</ol>`;
}

/**
 * renderImagesBlock
 * Renders every admin-attached image (already on Cloudflare R2's CDN)
 * as a 3-column, table-based grid — gallery-style, in displayOrder,
 * grouping images three-per-row. An HTML <table> (not CSS flex/grid) is
 * used deliberately: Outlook's Word rendering engine and several other
 * mail clients don't support flex/grid layout at all, so a <table> is
 * the only reliably cross-client way to get a real multi-column grid
 * in an email. Each cell is capped at ~33% width with a fixed gutter
 * so a single image can no longer render nearly full-email-width (the
 * old bug — width:100%;max-width:456px stacked one huge image per
 * row). A row that isn't evenly divisible by 3 leaves the remaining
 * cell(s) in that last row empty. Empty string when no images are
 * attached, so the section simply doesn't appear.
 */
const IMAGES_PER_ROW = 3;

function renderImagesBlock(images, mutedTextColor) {
  if (!images.length) return "";

  const cellWidthPercent = `${(100 / IMAGES_PER_ROW).toFixed(4)}%`;

  const cell = (image) =>
    image
      ? `<td width="${cellWidthPercent}" valign="top" style="width:${cellWidthPercent};padding:0 8px 16px 0;">
          <img src="${escapeHtml(image.imageUrl)}" alt="${escapeHtml(image.caption || "")}" style="width:100%;max-width:220px;border-radius:8px;display:block;" />
          ${image.caption ? `<p style="margin:6px 0 0;font-size:12px;color:${mutedTextColor};">${escapeHtml(image.caption)}</p>` : ""}
        </td>`
      : `<td width="${cellWidthPercent}" style="width:${cellWidthPercent};"></td>`;

  const rows = [];
  for (let i = 0; i < images.length; i += IMAGES_PER_ROW) {
    const rowCells = Array.from({ length: IMAGES_PER_ROW }, (_, offset) => cell(images[i + offset]));
    rows.push(`<tr>${rowCells.join("")}</tr>`);
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;"><tbody>${rows.join("")}</tbody></table>`;
}

/**
 * getOrCreateEmailSettings
 * Get-or-create for the singleton row, same pattern as the Policies
 * API route — the first confirmed booking on a fresh deployment
 * creates the row with its schema defaults instead of requiring a
 * separate seed step.
 */
async function getOrCreateEmailSettings() {
  return prisma.bookingConfirmationEmail.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    include: { images: { orderBy: { displayOrder: "asc" } } },
  });
}

/**
 * sendBookingConfirmationEmail
 * Best-effort — never throws. A failed send must never fail an
 * already-confirmed booking; the caller only logs the outcome.
 *
 * @param {object} input
 * @param {object} input.booking - the confirmed Booking row (must include `room` relation)
 * @returns {Promise<boolean>} whether the email actually went out
 */
export async function sendBookingConfirmationEmail({ booking }) {
  if (!booking?.guestEmail) {
    console.error("[bookingConfirmationEmail] Booking has no guest email — skipping send.");
    return false;
  }

  try {
    const [emailSettings, systemSettings] = await Promise.all([
      getOrCreateEmailSettings(),
      prisma.systemSettings.findUnique({ where: { id: "singleton" } }),
    ]);

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const invoiceUrl = siteUrl ? `${siteUrl}/api/bookings/${booking.id}/invoice` : null;
    const directionsUrl = siteUrl ? `${siteUrl}/visitor/directions` : null;

    // Same 6-digit hex re-validation as the wizard's save route
    // (app/api/system-setup-wizard/branding/route.js) — every one of
    // these is about to be interpolated raw into an inline style=""
    // attribute, so a malformed stored value must never fall through
    // unescaped into guest-facing HTML. Previously only brandAccentColor
    // was read here — every other text/box color below was hardcoded
    // as rgba(255,255,255,X)/#f4f4f5, i.e. colors meant for a DARK
    // background. This email actually renders on the light cream
    // brandBackgroundColor, so that text was nearly invisible — these
    // four additional brand colors fix that by matching what the rest
    // of the site (and the outer EmailJS template's own light theme)
    // already uses.
    const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
    const accentColor = HEX_COLOR_RE.test(systemSettings?.brandAccentColor ?? "")
      ? systemSettings.brandAccentColor
      : "#22c55e";
    const textColor = HEX_COLOR_RE.test(systemSettings?.brandTextColor ?? "")
      ? systemSettings.brandTextColor
      : "#1c2b20";
    const surfaceColor = HEX_COLOR_RE.test(systemSettings?.brandSurfaceColor ?? "")
      ? systemSettings.brandSurfaceColor
      : "#eef2e7";
    const borderColor = HEX_COLOR_RE.test(systemSettings?.brandBorderColor ?? "")
      ? systemSettings.brandBorderColor
      : "#d8e0d2";
    // Secondary/muted text (captions, adjusted-time note, rules intro)
    // — derived by lightening the real text color toward white, so it
    // stays legible against the light background at every brand color
    // the admin might pick, instead of a fixed gray that could clash.
    const mutedTextColor = mixHexWithWhite(textColor, 0.42);

    // Sequential Auto-Adjust (services/bookingPricing.js's Cleaning-Buffer
    // block, and the older Same-Day Check-In Policy block before it) may
    // have pushed this booking's real check-in/check-out moment later
    // than the rule's normal default — effectiveCheckInAt/
    // effectiveCheckOutAt carry the ACTUAL moment when that happened,
    // same fields app/visitor/booking/ReservationSummaryClient.jsx
    // already shows the guest in-app. Previously this email only ever
    // showed the plain calendar date (no time at all), so an adjusted
    // guest never learned their real check-in time until they arrived —
    // now it shows the exact date + time whenever an adjustment exists,
    // and falls back to the plain date for the normal, un-adjusted case.
    const checkInWasAdjusted = Boolean(booking.effectiveCheckInAt);
    const checkOutWasAdjusted = Boolean(booking.effectiveCheckOutAt);
    const checkInDate = checkInWasAdjusted
      ? FULL_DATE_TIME_FMT.format(new Date(booking.effectiveCheckInAt))
      : new Date(booking.checkInDate).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
    const checkOutDate = checkOutWasAdjusted
      ? FULL_DATE_TIME_FMT.format(new Date(booking.effectiveCheckOutAt))
      : new Date(booking.checkOutDate).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    const bodyMessage = [
      `<p style="margin:0 0 14px;color:${textColor};">Hi ${escapeHtml(booking.guestName)},</p>`,
      renderParagraphs(emailSettings.introMessage, textColor),
      // --- Booking details box ---
      `<div style="background:${surfaceColor};border:1px solid ${borderColor};border-radius:8px;padding:16px 20px;margin:0 0 20px;font-size:14px;line-height:1.8;color:${textColor};">
        <p style="margin:0;"><strong>Reference:</strong> ${escapeHtml(booking.referenceCode)}</p>
        <p style="margin:0;"><strong>Room/Package:</strong> ${escapeHtml(booking.room?.name || "N/A")}</p>
        <p style="margin:0;"><strong>Check-in:</strong> ${escapeHtml(checkInDate)} &nbsp; <strong>Check-out:</strong> ${escapeHtml(checkOutDate)}</p>
        ${
          checkInWasAdjusted
            ? `<p style="margin:6px 0 0;font-size:12.5px;color:${mutedTextColor};">Your check-in time was adjusted from the usual schedule because the previous guests' checkout and cleaning ran later that day.</p>`
            : ""
        }
        <p style="margin:0;"><strong>Guests:</strong> ${escapeHtml(booking.numberOfGuests)}</p>
        <p style="margin:0;"><strong>Total:</strong> ₱${escapeHtml(Number(booking.totalAmount).toLocaleString("en-PH"))} &nbsp; <strong>Deposit:</strong> ₱${escapeHtml(Number(booking.depositAmount).toLocaleString("en-PH"))}</p>
      </div>`,
      renderImagesBlock(emailSettings.images, mutedTextColor),
      // --- Resort Rules ---
      `<div style="margin:0 0 20px;">
        <h2 style="font-size:16px;margin:0 0 8px;color:${textColor};">${escapeHtml(emailSettings.resortRulesHeading)}</h2>
        <p style="margin:0 0 10px;font-size:14px;color:${mutedTextColor};">${escapeHtml(emailSettings.resortRulesIntro)}</p>
        ${renderResortRulesList(systemSettings?.houseRules, textColor)}
      </div>`,
      renderParagraphs(emailSettings.closingMessage, textColor),
      invoiceUrl ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(invoiceUrl)}" style="color:${accentColor};">View your invoice →</a></p>` : "",
      directionsUrl
        ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(directionsUrl)}" style="color:${accentColor};">Get turn-by-turn directions →</a></p>`
        : "",
      emailSettings.footerNote ? renderParagraphs(emailSettings.footerNote, textColor) : "",
    ]
      .filter(Boolean)
      .join("");

    return await sendGeneralEmail({
      toEmail: booking.guestEmail,
      subject: `${systemSettings?.siteTitle?.trim() || "your-private-resort"} — Booking Confirmed (${booking.referenceCode})`,
      eyebrow: emailSettings.eyebrowText,
      heading: emailSettings.headingText,
      highlightLine1: `Reference code: ${booking.referenceCode}`,
      highlightLine2: `${checkInDate} → ${checkOutDate}`,
      bodyMessage,
      emailType: "booking_confirmation",
      relatedBookingId: booking.id,
    });
  } catch (error) {
    console.error("[bookingConfirmationEmail] Failed to send:", error.message);
    return false;
  }
}