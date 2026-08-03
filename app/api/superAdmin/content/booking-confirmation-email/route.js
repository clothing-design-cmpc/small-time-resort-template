/**
 * FILE: app/api/superAdmin/content/booking-confirmation-email/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns the singleton BookingConfirmationEmail row plus its
 *        attached images (in display order), creating it with schema
 *        defaults on first request if it doesn't exist yet.
 * PUT -> updates the editable copy fields (eyebrow, heading, intro,
 *        resort rules heading/intro, closing message, footer note).
 *        Images are managed separately under ./images — this route
 *        never touches them.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function GET() {
  try {
    let settings = await prisma.bookingConfirmationEmail.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
      include: { images: { orderBy: { displayOrder: "asc" } } },
    });

    // Self-heal: rows created before introMessage/footerNote had a
    // schema-level @default would otherwise stay blank forever, since
    // the upsert above only seeds defaults on first-ever creation.
    // Backfill so the admin's tab always shows real starter copy
    // instead of a blank field.
    const backfill = {};
    if (!settings.introMessage) {
      backfill.introMessage =
        "Thank you for booking with us! Here's a quick summary of your confirmed stay, along with a few resort rules to review before you arrive.";
    }
    if (!settings.footerNote) {
      backfill.footerNote =
        "Have questions about your booking? Just reply to this email or message us on Facebook — we're happy to help.";
    }
    if (Object.keys(backfill).length > 0) {
      settings = await prisma.bookingConfirmationEmail.update({
        where: { id: "singleton" },
        data: backfill,
        include: { images: { orderBy: { displayOrder: "asc" } } },
      });
    }

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Booking confirmation email settings fetched successfully.",
    });
  } catch (error) {
    console.error("[BookingConfirmationEmail] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the email settings. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const updatedSettings = await prisma.bookingConfirmationEmail.upsert({
      where: { id: "singleton" },
      update: {
        eyebrowText: body.eyebrowText ?? null,
        headingText: body.headingText ?? null,
        introMessage: body.introMessage ?? null,
        resortRulesHeading: body.resortRulesHeading ?? null,
        resortRulesIntro: body.resortRulesIntro ?? null,
        closingMessage: body.closingMessage ?? null,
        footerNote: body.footerNote ?? null,
        updatedBy: session.uid,
      },
      create: {
        id: "singleton",
        eyebrowText: body.eyebrowText ?? null,
        headingText: body.headingText ?? null,
        introMessage: body.introMessage ?? null,
        resortRulesHeading: body.resortRulesHeading ?? null,
        resortRulesIntro: body.resortRulesIntro ?? null,
        closingMessage: body.closingMessage ?? null,
        footerNote: body.footerNote ?? null,
        updatedBy: session.uid,
      },
      include: { images: { orderBy: { displayOrder: "asc" } } },
    });

    // Audit trail (Rule 6) — who edited the booking confirmation email copy.
    await logAuditEvent({
      actor: session.uid,
      action: "updated",
      targetType: "BookingConfirmationEmail",
      targetId: "singleton",
      targetName: "Booking Confirmation Email",
      request,
      details: "Updated booking confirmation email content.",
    });

    return NextResponse.json({
      success: true,
      data: updatedSettings,
      message: "Booking confirmation email saved successfully.",
    });
  } catch (error) {
    console.error("[BookingConfirmationEmail] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the email settings. Please try again." },
      { status: 500 }
    );
  }
}
