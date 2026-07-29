/**
 * FILE: services/bookingRules.js
 * PURPOSE:
 * Resolves the BookingRule that is currently in effect for a given
 * booking type. Shared by app/api/booking-rules/route.js (public,
 * read-only), services/bookingPricing.js (validation + pricing), and
 * services/roomStatus.js, so all three always agree on which rule set
 * governs a given type of booking.
 *
 * IMPORTANT — "active" is a simple per-row toggle now, not enforced
 * exclusivity: any number of rule sets can be Active at the same time,
 * including more than one that allows the same booking type. When more
 * than one Active rule set allows a given type, the most recently
 * updated one wins (see the orderBy below) — so toggling a rule set to
 * Active always makes it the effective one for guests immediately,
 * without needing to deactivate anything else first.
 */
import { prisma } from "@/services/prisma";

const ALLOW_FIELD_BY_TYPE = {
  overnight: "allowOvernightStay",
  day_tour: "allowDayTour",
  night_tour: "allowNightTour",
};

/**
 * getActiveBookingRule
 * Returns the BookingRule that is currently active FOR THE GIVEN
 * bookingType ("overnight" | "day_tour" | "night_tour", defaults to
 * "overnight"). If no rule is marked active for this type yet, falls
 * back to the oldest existing rule that allows this type and activates
 * it, or — if literally no rule set allows this type at all yet —
 * bootstraps a new one with schema defaults for this type, active
 * immediately. This guarantees the visitor booking flow never breaks
 * for ANY of the three booking types, even if an admin has only ever
 * configured one of them.
 */
export async function getActiveBookingRule(bookingType = "overnight") {
  const allowField = ALLOW_FIELD_BY_TYPE[bookingType] ?? "allowOvernightStay";

  // Several rule sets can be Active for the same type at once — the
  // most recently updated (most recently toggled Active) one is the
  // effective one for guests.
  const activeRule = await prisma.bookingRule.findFirst({
    where: { isActive: true, [allowField]: true },
    orderBy: { updatedAt: "desc" },
  });
  if (activeRule) return activeRule;

  // No rule is active for THIS type — recover using the oldest existing
  // rule that's eligible (allows this type), rather than creating a
  // duplicate row. This never touches whichever rule is already active
  // for a different booking type.
  const oldestEligibleRule = await prisma.bookingRule.findFirst({
    where: { [allowField]: true },
    orderBy: { createdAt: "asc" },
  });
  if (oldestEligibleRule) {
    return prisma.bookingRule.update({
      where: { id: oldestEligibleRule.id },
      data: { isActive: true },
    });
  }

  // No rule set allows this booking type at all yet — bootstrap one with
  // schema defaults for this type, active immediately.
  return prisma.bookingRule.create({
    data: { name: `Default Rules (${bookingType})`, isActive: true, [allowField]: true },
  });
}

/**
 * getActiveBookingRuleForDateCount
 * Same resolution as getActiveBookingRule() above, but first tries to
 * find an Active rule set for this booking type whose
 * howManySelectedDates matches the guest's actual NIGHTS selected (e.g.
 * a "4Ds-3Ns" rule set has howManySelectedDates = 3 — see that column's
 * comment on the BookingRule model). Falls back to
 * getActiveBookingRule()'s existing "most recently updated Active rule"
 * behavior whenever howManySelectedDates isn't given or nothing matches
 * that count, so single-rule resorts and Day Tour/Night Tour (which
 * don't use this per-length matching) keep working exactly as before.
 */
export async function getActiveBookingRuleForDateCount(bookingType = "overnight", howManySelectedDates = null) {
  const allowField = ALLOW_FIELD_BY_TYPE[bookingType] ?? "allowOvernightStay";

  if (Number.isInteger(howManySelectedDates) && howManySelectedDates > 0) {
    const matchedRule = await prisma.bookingRule.findFirst({
      where: { isActive: true, [allowField]: true, howManySelectedDates },
      orderBy: { updatedAt: "desc" },
    });
    if (matchedRule) return matchedRule;
  }

  return getActiveBookingRule(bookingType);
}

/**
 * resolvePackageInclusions
 * Combines a BookingRule's three separate inclusion sources — free-text
 * packageInclusions, includedAmenityIds, and includedProductIds — into
 * one flat array of display-ready strings, in that order. Used by the
 * invoice PDF (services/invoicePdf.js) so it never needs to touch the
 * database itself; callers just resolve once and pass the result in.
 * Returns [] for a null rule or a rule with nothing configured — the
 * invoice section is skipped entirely in that case.
 */
export async function resolvePackageInclusions(bookingRule) {
  if (!bookingRule) return [];

  const inclusions = [...(bookingRule.packageInclusions ?? [])];

  if (bookingRule.includedAmenityIds?.length) {
    const amenities = await prisma.amenity.findMany({
      where: { id: { in: bookingRule.includedAmenityIds } },
      select: { name: true },
    });
    inclusions.push(...amenities.map((a) => a.name));
  }

  if (bookingRule.includedProductIds?.length) {
    const products = await prisma.storeProduct.findMany({
      where: { id: { in: bookingRule.includedProductIds } },
      select: { name: true },
    });
    inclusions.push(...products.map((p) => p.name));
  }

  return inclusions;
}