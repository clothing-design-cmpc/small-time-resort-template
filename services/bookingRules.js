/**
 * FILE: services/bookingRules.js
 * PURPOSE:
 * Resolves the BookingRule that is currently in effect for a given
 * booking type. Shared by app/api/booking-rules/route.js (public,
 * read-only), services/bookingPricing.js (validation + pricing), and
 * services/roomStatus.js, so all three always agree on which rule set
 * governs a given type of booking.
 *
 * IMPORTANT — "active" is scoped PER BOOKING TYPE, not resort-wide:
 * Overnight, Day Tour, and Night Tour each have their own independent
 * "active" slot. A rule set is only eligible to be the active one for a
 * type if its matching allow* flag (allowOvernightStay / allowDayTour /
 * allowNightTour) is true. This means a "Day Tour" rule set being active
 * never displaces whichever rule set is active for Overnight — they can,
 * and normally will, be different rows active at the same time. The
 * enforcement side of this lives in the /activate API route: activating
 * a rule only deactivates OTHER rules that share at least one of the
 * same allow* flags, never rules for an unrelated booking type.
 *
 * (Earlier version of this file treated "active" as a single resort-wide
 * slot shared by all booking types — that meant activating a Day Tour
 * rule set silently left Overnight/Night Tour with no active rule at
 * all if their own rule sets weren't also active on that same row.)
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

  const activeRule = await prisma.bookingRule.findFirst({
    where: { isActive: true, [allowField]: true },
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
 * selfHealActiveRulesForExistingTypes
 * Admin "Booking Rules & Configuration" list page only. For each of the
 * three booking types, if the admin has already configured at least one
 * rule set that allows it but none of those is marked active, activates
 * the oldest eligible one — so existing/legacy data (rows migrated in
 * before per-type activation existed) shows as Active immediately on
 * page load instead of waiting for a guest to trigger it.
 *
 * Deliberately does NOT bootstrap-create a rule set for a type the admin
 * has never configured at all (unlike getActiveBookingRule() above) —
 * that behavior belongs to the public/guest path only. Otherwise simply
 * opening this admin page would silently spawn a "Default Rules
 * (day_tour)" row for a resort that intentionally doesn't offer day
 * tours yet.
 */
export async function selfHealActiveRulesForExistingTypes() {
  for (const [bookingType, allowField] of Object.entries(ALLOW_FIELD_BY_TYPE)) {
    const anyEligibleRule = await prisma.bookingRule.findFirst({ where: { [allowField]: true } });
    if (!anyEligibleRule) continue; // this type isn't configured at all yet — leave it alone

    const alreadyActive = await prisma.bookingRule.findFirst({
      where: { isActive: true, [allowField]: true },
    });
    if (alreadyActive) continue;

    const oldestEligibleRule = await prisma.bookingRule.findFirst({
      where: { [allowField]: true },
      orderBy: { createdAt: "asc" },
    });
    await prisma.bookingRule.update({
      where: { id: oldestEligibleRule.id },
      data: { isActive: true },
    });
  }
}
