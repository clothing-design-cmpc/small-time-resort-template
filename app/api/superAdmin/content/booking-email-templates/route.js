/**
 * FILE: app/api/superAdmin/content/booking-email-templates/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns all 4 non-confirmation booking email templates
 *        (pending, cancelled, auto_cancelled, rebooked), get-or-
 *        creating each with its default copy on first request.
 * PUT -> updates one template's copy fields (eyebrow, heading, intro,
 *        body) by templateKey. The "confirmed" template is NOT
 *        handled here — it keeps its own dedicated route at
 *        ./booking-confirmation-email (including its images gallery).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";
import { getAllEmailTemplates, TEMPLATE_KEYS, TEMPLATE_LABELS } from "@/services/bookingEmailTemplates";

export async function GET() {
  try {
    const templates = await getAllEmailTemplates();

    return NextResponse.json({
      success: true,
      data: templates,
      message: "Booking email templates fetched successfully.",
    });
  } catch (error) {
    console.error("[BookingEmailTemplates] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the email templates. Please try again." },
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
    const { templateKey } = body;

    // Reject any key that isn't one of the four known templates —
    // never let the request body pick an arbitrary row id.
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      return NextResponse.json(
        { success: false, data: null, message: "Unknown email template." },
        { status: 400 }
      );
    }

    const fields = {
      eyebrowText: body.eyebrowText ?? null,
      headingText: body.headingText ?? null,
      introMessage: body.introMessage ?? null,
      bodyMessage: body.bodyMessage ?? null,
      updatedBy: session.uid,
    };

    const updatedTemplate = await prisma.bookingEmailTemplate.upsert({
      where: { id: templateKey },
      update: fields,
      create: { id: templateKey, ...fields },
    });

    // Audit trail (Rule 6) — who edited which booking email template.
    await logAuditEvent({
      actor: session.uid,
      action: "updated",
      targetType: "BookingEmailTemplate",
      targetId: templateKey,
      targetName: `${TEMPLATE_LABELS[templateKey]} Email`,
      request,
      details: `Updated "${TEMPLATE_LABELS[templateKey]}" booking email content.`,
    });

    return NextResponse.json({
      success: true,
      data: updatedTemplate,
      message: "Email template saved successfully.",
    });
  } catch (error) {
    console.error("[BookingEmailTemplates] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this email template. Please try again." },
      { status: 500 }
    );
  }
}
