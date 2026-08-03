/**
 * FILE: app/api/superAdmin/settings/promo-dates/[promoId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates a single promo date entry's date/discount%/label/
 *           applies-to scope (contrast with POST in the parent
 *           route.js, which batch-creates many rows at once — editing
 *           always targets exactly one existing row).
 * DELETE -> removes a single promo date entry.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

const VALID_APPLIES_TO = ["all", "overnight", "day_tour", "night_tour"];

export async function PUT(request, { params }) {
  const { promoId } = await params;

  try {
    const body = await request.json();

    const existingEntry = await prisma.promoDate.findUnique({ where: { id: promoId } });
    if (!existingEntry) {
      return NextResponse.json({ success: false, data: null, message: "Promo date not found." }, { status: 404 });
    }

    if (body.discountPercent == null || Number(body.discountPercent) <= 0 || Number(body.discountPercent) > 100) {
      return NextResponse.json(
        { success: false, data: null, message: "Discount must be between 0 and 100." },
        { status: 400 }
      );
    }
    const appliesTo = body.appliesTo ?? existingEntry.appliesTo;
    if (!VALID_APPLIES_TO.includes(appliesTo)) {
      return NextResponse.json(
        { success: false, data: null, message: "Applies To must be one of: all, overnight, day_tour, night_tour." },
        { status: 400 }
      );
    }

    // Same UTC-midnight anchor convention as the batch-create route —
    // keeps a single edited date from drifting off the day the admin
    // actually picked in the date input.
    const date = body.date ? new Date(`${body.date}T00:00:00Z`) : existingEntry.date;
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ success: false, data: null, message: "Invalid date." }, { status: 400 });
    }

    const updatedEntry = await prisma.promoDate.update({
      where: { id: promoId },
      data: {
        date,
        discountPercent: body.discountPercent,
        label: body.label || null,
        appliesTo,
        isActive: body.isActive ?? existingEntry.isActive,
      },
    });

    // Audit trail (Rule 6) — promo discounts directly affect revenue.
    const session = requireSuperAdmin(request);
    await logAuditEvent({
      actor: session?.uid ?? null,
      action: "updated",
      targetType: "PromoDate",
      targetId: updatedEntry.id,
      targetName: updatedEntry.label || updatedEntry.date.toISOString().slice(0, 10),
      request,
      details: `Updated promo date (${existingEntry.discountPercent}% → ${updatedEntry.discountPercent}%, applies to "${updatedEntry.appliesTo}").`,
    });

    return NextResponse.json({ success: true, data: updatedEntry, message: "Promo date updated successfully." });
  } catch (error) {
    console.error("[PromoDates] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { promoId } = await params;

  try {
    const existingEntry = await prisma.promoDate.findUnique({ where: { id: promoId } });
    if (!existingEntry) {
      return NextResponse.json({ success: false, data: null, message: "Promo date not found." }, { status: 404 });
    }

    await prisma.promoDate.delete({ where: { id: promoId } });

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    const session = requireSuperAdmin(request);
    await logAuditEvent({
      actor: session?.uid ?? null,
      action: "deleted",
      targetType: "PromoDate",
      targetId: existingEntry.id,
      targetName: existingEntry.label || existingEntry.date.toISOString().slice(0, 10),
      request,
      details: `Deleted promo date "${existingEntry.date.toISOString().slice(0, 10)}" (${existingEntry.discountPercent}% off).`,
    });

    return NextResponse.json({ success: true, data: null, message: "Promo date deleted successfully." });
  } catch (error) {
    console.error("[PromoDates] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this promo date. Please try again." },
      { status: 500 }
    );
  }
}
