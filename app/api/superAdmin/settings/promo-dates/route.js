/**
 * FILE: app/api/superAdmin/settings/promo-dates/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every Promo Date entry, soonest date first.
 * POST -> BATCH creates one PromoDate row per tapped calendar date —
 *         the admin selects one or more dates at once in
 *         PromoDatesSection.jsx's calendar, all sharing the same
 *         discountPercent/label/appliesTo, so this accepts a `dates`
 *         array instead of a single `date` (contrast with PUT in
 *         [promoId]/route.js, which edits exactly one existing row).
 *         Duplicate (date, appliesTo, bookingRuleId) triples are
 *         silently skipped (skipDuplicates) rather than erroring the
 *         whole batch — the @@unique([date, appliesTo, bookingRuleId])
 *         constraint in schema.prisma is the actual backstop;
 *         re-tapping an already-promo'd date/scope just leaves the
 *         existing entry untouched instead of failing loud.
 *
 *         bookingRuleId (optional) scopes the promo to ONE specific
 *         Booking Rule set — omit it (or send null) to keep the promo
 *         applying no matter which rule set governs the date, same as
 *         before this field existed.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";
import { cleanupExpiredPromoDates } from "@/services/promoDates";

const VALID_APPLIES_TO = ["all", "overnight", "day_tour", "night_tour"];

export async function GET() {
  try {
    // Purge any promo whose date has already passed before reading —
    // see services/promoDates.js for why this runs here instead of
    // relying on the daily cron alone (works in local dev too).
    await cleanupExpiredPromoDates();

    const promoDates = await prisma.promoDate.findMany({
      orderBy: { date: "asc" },
      include: { bookingRule: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      success: true,
      data: promoDates,
      message: "Promo dates fetched successfully.",
    });
  } catch (error) {
    console.error("[PromoDates] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load promo dates. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const dates = Array.isArray(body.dates) ? body.dates : [];
    const appliesTo = body.appliesTo ?? "all";

    if (dates.length === 0) {
      return NextResponse.json(
        { success: false, data: null, message: "Please tap at least one date on the calendar." },
        { status: 400 }
      );
    }
    if (body.discountPercent == null || Number(body.discountPercent) <= 0 || Number(body.discountPercent) > 100) {
      return NextResponse.json(
        { success: false, data: null, message: "Discount must be between 0 and 100." },
        { status: 400 }
      );
    }
    if (!VALID_APPLIES_TO.includes(appliesTo)) {
      return NextResponse.json(
        { success: false, data: null, message: "Applies To must be one of: all, overnight, day_tour, night_tour." },
        { status: 400 }
      );
    }

    // Optional rule-set scope — "" / undefined / null all mean "applies
    // to every rule set" (unscoped). Validate that a non-empty value
    // actually points to a real BookingRule before writing it, so a
    // stale/deleted rule ID never gets silently saved.
    const bookingRuleId = body.bookingRuleId || null;
    if (bookingRuleId) {
      const ruleExists = await prisma.bookingRule.findUnique({ where: { id: bookingRuleId }, select: { id: true } });
      if (!ruleExists) {
        return NextResponse.json(
          { success: false, data: null, message: "Selected booking rule set was not found." },
          { status: 400 }
        );
      }
    }

    // Anchor every date at UTC midnight before handing to Prisma's
    // @db.Date column — matches the same write-path convention already
    // used for Booking.checkInDate (see app/api/bookings/route.js) so a
    // promo date can never silently drift a day off from what the admin
    // actually tapped on the calendar.
    const parsedDates = dates.map((dateKey) => new Date(`${dateKey}T00:00:00Z`));
    if (parsedDates.some((d) => Number.isNaN(d.getTime()))) {
      return NextResponse.json(
        { success: false, data: null, message: "One or more selected dates are invalid." },
        { status: 400 }
      );
    }

    await prisma.promoDate.createMany({
      data: parsedDates.map((date) => ({
        date,
        discountPercent: body.discountPercent,
        label: body.label || null,
        appliesTo,
        bookingRuleId,
      })),
      skipDuplicates: true,
    });

    // Re-select so the response (and audit log) reflects exactly what's
    // now in the DB for these dates — createMany itself only returns a
    // count, not the rows, and some may have been skipped as duplicates.
    const createdEntries = await prisma.promoDate.findMany({
      where: { date: { in: parsedDates }, appliesTo, bookingRuleId },
      orderBy: { date: "asc" },
      include: { bookingRule: { select: { id: true, name: true } } },
    });

    // Audit trail (Rule 6) — promo discounts directly affect revenue.
    const session = requireSuperAdmin(request);
    await logAuditEvent({
      actor: session?.uid ?? null,
      action: "created",
      targetType: "PromoDate",
      targetId: createdEntries.map((entry) => entry.id).join(","),
      targetName: body.label || `${dates.length} promo date(s)`,
      request,
      details: `Added ${createdEntries.length} promo date(s) (${body.discountPercent}% off, applies to "${appliesTo}", rule set: ${createdEntries[0]?.bookingRule?.name ?? "All rule sets"}).`,
    });

    return NextResponse.json(
      { success: true, data: createdEntries, message: "Promo dates added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[PromoDates] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add these promo dates. Please try again." },
      { status: 500 }
    );
  }
}
