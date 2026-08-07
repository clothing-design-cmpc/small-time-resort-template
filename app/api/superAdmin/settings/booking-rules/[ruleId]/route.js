/**
 * FILE: app/api/superAdmin/settings/booking-rules/[ruleId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET    -> fetch a single booking rule set for the edit form.
 * PUT    -> update a rule set. Re-checks name uniqueness (excluding
 *           itself). Never touches isActive here — that's handled only
 *           by the dedicated activate endpoint, so "Save Changes" on a
 *           rule set can never silently make it (or another rule) the
 *           active one by accident.
 * DELETE -> deletes a rule set. Blocked if it's currently active (an
 *           admin must activate a different one first) or if it's the
 *           only rule set left (the resort must always have at least
 *           one to fall back on).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { normalizeBookingTypeFlags } from "@/services/bookingTypeFlags";
import { findAllCleaningBufferConflicts } from "@/services/cleaningBuffer";
import { getGlobalCleaningHours } from "@/services/cleaningHours";

export async function GET(request, { params }) {
  const { ruleId } = await params;

  try {
    const rule = await prisma.bookingRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      return NextResponse.json({ success: false, data: null, message: "Booking rule set not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: rule, message: "Booking rule set fetched successfully." });
  } catch (error) {
    console.error("[BookingRules] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this rule set. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const { ruleId } = await params;

  try {
    const body = await request.json();
    const name = body.name?.trim();

    const existingRule = await prisma.bookingRule.findUnique({ where: { id: ruleId } });
    if (!existingRule) {
      return NextResponse.json({ success: false, data: null, message: "Booking rule set not found." }, { status: 404 });
    }

    // Duplicate check excludes this rule's own current name.
    if (name && name !== existingRule.name) {
      const nameTaken = await prisma.bookingRule.findUnique({ where: { name } });
      if (nameTaken) {
        return NextResponse.json(
          { success: false, data: null, message: "A booking rule set with this name already exists." },
          { status: 409 }
        );
      }
    }

    // Enforce mutual exclusivity server-side regardless of what the
    // client sent — see services/bookingTypeFlags.js for why this
    // matters (a stale/incorrect flag combination silently persisting
    // forever was the actual root cause of a real mismatched-package
    // bug in production).
    const bookingTypeFlags = normalizeBookingTypeFlags(body);

    // Cleaning-buffer conflict check — checked against ALL THREE booking
    // types' own check-in/check-out time pairs (Overnight, Day Tour,
    // Night Tour) on this rule set. Cleaning Hours itself is resort-wide
    // now (SystemSettings, see services/cleaningHours.js), not a field
    // on this row — edited separately via the Cleaning Hours setting —
    // so the current global value is what this rule set's (possibly
    // updated) times get checked against. Falls back to this rule's
    // existing saved values for whichever time fields weren't resent.
    const globalCleaningHours = await getGlobalCleaningHours();
    const bufferConflict = findAllCleaningBufferConflicts(
      {
        checkInTime: body.checkInTime || existingRule.checkInTime,
        checkOutTime: body.checkOutTime || existingRule.checkOutTime,
        dayTourStartTime: body.dayTourStartTime || existingRule.dayTourStartTime,
        dayTourEndTime: body.dayTourEndTime || existingRule.dayTourEndTime,
        nightTourStartTime: body.nightTourStartTime || existingRule.nightTourStartTime,
        nightTourEndTime: body.nightTourEndTime || existingRule.nightTourEndTime,
      },
      globalCleaningHours
    );
    if (bufferConflict) {
      return NextResponse.json(
        { success: false, data: null, message: bufferConflict.message, conflictFields: bufferConflict.fields },
        { status: 400 }
      );
    }

    const updatedRule = await prisma.bookingRule.update({
      where: { id: ruleId },
      data: {
        name: name || existingRule.name,
        ruleDates: Array.isArray(body.ruleDates) ? body.ruleDates : undefined,
        // Denormalized nights count for the date-count rule matching
        // used by services/bookingRules.js -> getActiveBookingRuleForDateCount()
        // (see BookingRule.howManySelectedDates in prisma/schema.prisma).
        howManySelectedDates: Array.isArray(body.ruleDates) ? body.ruleDates.length : undefined,
        checkInTime: body.checkInTime,
        checkOutTime: body.checkOutTime,
        sameDayPolicy: body.sameDayPolicy,
        nearTermCancellationPolicy: body.nearTermCancellationPolicy,
        allowOvernightStay: bookingTypeFlags.allowOvernightStay,
        allowDayTour: bookingTypeFlags.allowDayTour,
        allowNightTour: bookingTypeFlags.allowNightTour,
        dayTourStartTime: body.dayTourStartTime,
        dayTourEndTime: body.dayTourEndTime,
        dayTourPricePerGuest: body.dayTourPricePerGuest,
        nightTourStartTime: body.nightTourStartTime,
        nightTourEndTime: body.nightTourEndTime,
        nightTourPricePerGuest: body.nightTourPricePerGuest,
        hourlyChargeAmount: body.hourlyChargeAmount,
        // Visitor-facing guest count for this rule set — read by the
        // public reservation page and displayed there as text.
        allowedGuests: body.allowedGuests,
        // Total Pax — hard capacity cap, distinct from allowedGuests
        // above (see prisma/schema.prisma BookingRule.maxPax comment).
        maxPax: body.maxPax,
        extraGuestFeePerHead: body.extraGuestFeePerHead,
        // Package Inclusions — shown to the visitor as "Included in
        // this package" on the reservation summary.
        includedAmenityIds: Array.isArray(body.includedAmenityIds) ? body.includedAmenityIds : undefined,
        // Package Inclusions -> Shop Products checklist (StoreProduct.id
        // values) — same wiring as includedAmenityIds above.
        includedProductIds: Array.isArray(body.includedProductIds) ? body.includedProductIds : undefined,
        packageInclusions: Array.isArray(body.packageInclusions) ? body.packageInclusions : undefined,
        refundPercentage: body.refundPercentage,
        cancellationCutoffDays: body.cancellationCutoffDays,
        depositRequired: body.depositRequired,
        depositPercentage: body.depositPercentage,
        weekendSurchargePercent: body.weekendSurchargePercent,
        lastMinuteDiscountPercent: body.lastMinuteDiscountPercent,
        groupDiscountThreshold: body.groupDiscountThreshold,
        groupDiscountPercent: body.groupDiscountPercent,
        seasonalPricingEnabled: body.seasonalPricingEnabled,
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — which rule set changed, and who changed it.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Updated booking rule set "${existingRule.name}".`,
    });

    return NextResponse.json({ success: true, data: updatedRule, message: "Booking rule set saved successfully." });
  } catch (error) {
    console.error("[BookingRules] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this rule set. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { ruleId } = await params;

  try {
    const rule = await prisma.bookingRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      return NextResponse.json({ success: false, data: null, message: "Booking rule set not found." }, { status: 404 });
    }

    if (rule.isActive) {
      return NextResponse.json(
        { success: false, data: null, message: "This rule set is currently active. Activate a different rule set before deleting it." },
        { status: 409 }
      );
    }

    const totalRuleCount = await prisma.bookingRule.count();
    if (totalRuleCount <= 1) {
      return NextResponse.json(
        { success: false, data: null, message: "The resort must always have at least one booking rule set." },
        { status: 409 }
      );
    }

    await prisma.bookingRule.delete({ where: { id: ruleId } });

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Deleted booking rule set "${rule.name}".`,
    });

    return NextResponse.json({ success: true, data: null, message: "Booking rule set deleted successfully." });
  } catch (error) {
    console.error("[BookingRules] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this rule set. Please try again." },
      { status: 500 }
    );
  }
}
