/**
 * FILE: app/api/superAdmin/content/testimonials/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every testimonial, in display order, for the
 *         Testimonials Management list page (blueprint Page 5).
 * POST -> creates a new testimonial. guestPhoto/guestPhotoKey are
 *         optional — a testimonial can be added with no photo.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET() {
  try {
    const testimonials = await prisma.testimonial.findMany({
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: testimonials, message: "Testimonials fetched successfully." });
  } catch (error) {
    console.error("[Testimonials] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the testimonials. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const guestName = body.guestName?.trim();

    if (!guestName) {
      return NextResponse.json(
        { success: false, data: null, message: "Guest name is required." },
        { status: 400 }
      );
    }

    // New testimonials go to the end of the display order by default so
    // they don't jump ahead of existing ones on the visitor page.
    const lastTestimonial = await prisma.testimonial.findFirst({ orderBy: { displayOrder: "desc" } });
    const nextDisplayOrder = (lastTestimonial?.displayOrder ?? -1) + 1;

    const testimonial = await prisma.testimonial.create({
      data: {
        guestName,
        guestPhoto: body.guestPhoto || null,
        guestPhotoKey: body.guestPhotoKey || null,
        rating: body.rating ?? 5,
        quote: (body.quote || "").slice(0, 500),
        isFeatured: body.isFeatured ?? false,
        displayOrder: body.displayOrder ?? nextDisplayOrder,
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — who added which testimonial.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Added testimonial from "${testimonial.guestName}".`,
    });

    return NextResponse.json(
      { success: true, data: testimonial, message: "Testimonial added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Testimonials] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this testimonial. Please try again." },
      { status: 500 }
    );
  }
}
