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
 * renderParagraphs
 * Splits admin-edited plain text on blank lines into <p> blocks —
 * same blank-line convention as the visitor Policies page's
 * renderTextBlock(), just emitting HTML instead of JSX.
 */
function renderParagraphs(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => `<p style="margin:0 0 14px;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
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
function renderResortRulesList(houseRulesText) {
  const trimmed = (houseRulesText ?? "").trim();
  const rules = trimmed
    ? trimmed.split(/\n\s*\n/).map((rule) => rule.trim()).filter(Boolean)
    : DEFAULT_HOUSE_RULES;

  const items = rules.map((rule) => `<li style="margin:0 0 8px;">${escapeHtml(rule)}</li>`).join("");
  return `<ol style="margin:0;padding-left:20px;">${items}</ol>`;
}

/**
 * renderImagesBlock
 * Renders every admin-attached image (already on Cloudflare R2's CDN)
 * as a stacked, full-width <img> block — gallery-style, in
 * displayOrder. Empty string when no images are attached, so the
 * section simply doesn't appear.
 */
function renderImagesBlock(images) {
  if (!images.length) return "";
  return images
    .map(
      (image) => `
        <div style="margin:0 0 16px;">
          <img src="${escapeHtml(image.imageUrl)}" alt="${escapeHtml(image.caption || "")}" style="width:100%;max-width:456px;border-radius:8px;display:block;" />
          ${image.caption ? `<p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.45);">${escapeHtml(image.caption)}</p>` : ""}
        </div>`
    )
    .join("");
}

/**
 * getOrCreateEmailSettings
 * Get-or-create for the singleton row, same pattern as the Policies
 * API route — the first confirmed booking on a fresh deployment
 * creates the row with its schema defaults instead of requiring a
 * separate seed step.
 */
async function getOrCreateEmailSettings() {
  const settings = await prisma.bookingConfirmationEmail.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    include: { images: { orderBy: { displayOrder: "asc" } } },
  });

  // Self-heal: rows created before introMessage/footerNote had a
  // schema-level @default would otherwise send with a blank intro/
  // footer forever. Backfill in-memory only (no extra write) so
  // outbound emails always carry real copy — the admin route already
  // persists the same backfill the next time the settings page loads.
  return {
    ...settings,
    introMessage:
      settings.introMessage ||
      "Thank you for booking with us! Here's a quick summary of your confirmed stay, along with a few resort rules to review before you arrive.",
    footerNote:
      settings.footerNote ||
      "Have questions about your booking? Just reply to this email or message us on Facebook — we're happy to help.",
  };
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

    const checkInDate = new Date(booking.checkInDate).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const checkOutDate = new Date(booking.checkOutDate).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const bodyMessage = [
      `<p style="margin:0 0 14px;">Hi ${escapeHtml(booking.guestName)},</p>`,
      renderParagraphs(emailSettings.introMessage),
      // --- Booking details box ---
      `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:16px 20px;margin:0 0 20px;font-size:14px;line-height:1.8;">
        <p style="margin:0;"><strong>Reference:</strong> ${escapeHtml(booking.referenceCode)}</p>
        <p style="margin:0;"><strong>Room/Package:</strong> ${escapeHtml(booking.room?.name || "N/A")}</p>
        <p style="margin:0;"><strong>Check-in:</strong> ${escapeHtml(checkInDate)} &nbsp; <strong>Check-out:</strong> ${escapeHtml(checkOutDate)}</p>
        <p style="margin:0;"><strong>Guests:</strong> ${escapeHtml(booking.numberOfGuests)}</p>
        <p style="margin:0;"><strong>Total:</strong> ₱${escapeHtml(Number(booking.totalAmount).toLocaleString("en-PH"))} &nbsp; <strong>Deposit:</strong> ₱${escapeHtml(Number(booking.depositAmount).toLocaleString("en-PH"))}</p>
      </div>`,
      renderImagesBlock(emailSettings.images),
      // --- Resort Rules ---
      `<div style="margin:0 0 20px;">
        <h2 style="font-size:16px;margin:0 0 8px;color:#f4f4f5;">${escapeHtml(emailSettings.resortRulesHeading)}</h2>
        <p style="margin:0 0 10px;font-size:14px;color:rgba(255,255,255,0.6);">${escapeHtml(emailSettings.resortRulesIntro)}</p>
        ${renderResortRulesList(systemSettings?.houseRules)}
      </div>`,
      renderParagraphs(emailSettings.closingMessage),
      invoiceUrl ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(invoiceUrl)}" style="color:#22c55e;">View your invoice →</a></p>` : "",
      directionsUrl
        ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(directionsUrl)}" style="color:#22c55e;">Get turn-by-turn directions →</a></p>`
        : "",
      emailSettings.footerNote ? renderParagraphs(emailSettings.footerNote) : "",
    ]
      .filter(Boolean)
      .join("");

    return await sendGeneralEmail({
      toEmail: booking.guestEmail,
      subject: `your-private-resort — Booking Confirmed (${booking.referenceCode})`,
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
