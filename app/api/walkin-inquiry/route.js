/**
 * FILE: app/api/walkin-inquiry/route.js
 * ROLE: Public — no auth required, called by the floating chat widget
 *
 * PURPOSE:
 * Creates a WalkInInquiry lead from the visitor site's floating
 * "Chat with us" widget (bottom-right icon -> modal form). Captures
 * name and phone (guest-entered) plus IP address (server-side only,
 * never trusted from the client) so staff can call the guest back
 * about a walk-in or phone-in reservation.
 *
 * DATA FLOW:
 * 1. WalkInChatWidget.jsx POSTs { guestName, guestPhone }
 * 2. Rate limited to 10 submissions per 15 minutes per IP (Rule 32.1,
 *    same tier as the booking/contact form endpoints)
 * 3. Zod validates the shape; scanForSqlInjection() flags known attack
 *    patterns as defense-in-depth visibility (Rule 39)
 * 4. Inserts the WalkInInquiry row and logs a "walkin_inquiry_submitted"
 *    VisitorLog entry (same pattern app/api/bookings/route.js uses for
 *    booking_submitted) so it also shows up in Visitor Logs with geo
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { logVisitorActivity } from "@/services/visitorLog";
import { sendAdminWalkInAlert } from "@/services/adminAlert";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";

const WALKIN_INQUIRY_MAX = 10;
const WALKIN_INQUIRY_WINDOW_MS = 15 * 60 * 1000;

const walkInInquirySchema = z.object({
  guestName: z.string().trim().min(2, "Enter your name.").max(120),
  guestPhone: z.string().trim().min(7, "Enter a valid phone number.").max(30),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate limit — same 10/15min "contact form" tier as the booking form (Rule 32.1)
  const { allowed } = await checkRateLimit(`walkin-inquiry:${ip}`, WALKIN_INQUIRY_MAX, WALKIN_INQUIRY_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${WALKIN_INQUIRY_MAX} walk-in inquiry attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = walkInInquirySchema.parse(await request.json());
  } catch (validationError) {
    const firstIssue = validationError?.issues?.[0]?.message;
    return NextResponse.json(
      { success: false, data: null, message: firstIssue || "Please check the form for errors." },
      { status: 400 }
    );
  }

  // Defense-in-depth detection layer (Rule 39) — Prisma already makes
  // real SQL injection structurally impossible; this just logs the
  // attempt so it's visible in Security Logs.
  const sqliHit = scanForSqlInjection(payload);
  if (sqliHit) {
    await logSecurityEvent({
      eventType: "sql_injection_attempt",
      actor: null,
      request,
      details: `Suspicious pattern detected in field "${sqliHit}" on walk-in inquiry form.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Please check the form for errors." },
      { status: 400 }
    );
  }

  try {
    await prisma.walkInInquiry.create({
      data: {
        guestName: payload.guestName,
        guestPhone: payload.guestPhone,
        ipAddress: ip !== "unknown" ? ip : null,
      },
    });

    // Notable visitor transaction — same treatment as booking_submitted,
    // so it also appears (with geo) on the Visitor Logs page.
    await logVisitorActivity({
      request,
      action: "walkin_inquiry_submitted",
      path: "/visitor",
      details: `${payload.guestName} requested a callback (${payload.guestPhone}).`,
      withLocation: true,
    }).catch((error) => {
      // Logging must never break a successful submission.
      console.error("[api/walkin-inquiry] Failed to log visitor activity:", error.message);
    });

    // Admin Telegram alert — best-effort, never blocks or fails the
    // submission response. Skips silently if SystemSettings.
    // adminTelegramChatIds isn't configured yet (see services/adminAlert.js).
    sendAdminWalkInAlert({
      guestName: payload.guestName,
      guestPhone: payload.guestPhone,
    }).catch((error) => {
      console.error("[api/walkin-inquiry] Failed to send admin alert:", error.message);
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Thanks! We'll call you back shortly.",
    });
  } catch (error) {
    console.error("[api/walkin-inquiry] Failed to create inquiry:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't send that. Please try again." },
      { status: 500 }
    );
  }
}
