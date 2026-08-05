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

// How long a "pending" booking holds its dates before the owner must
// confirm it on Messenger (no PayMongo integration yet — see
// app/api/bookings/route.js, app/api/cron/booking-expiry/route.js, and
// Booking.pendingExpiresAt). This used to be a hardcoded constant here;
// it's now a super-admin-configurable value stored on
// SystemSettings.pendingHoldHours — see services/pendingHoldHours.js's
// getGlobalPendingHoldHours() for the live value.

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
 * back to the oldest existing rule that allows this type (READ-ONLY —
 * see note below), or — if literally no rule set allows this type at
 * all yet — bootstraps a new one with schema defaults for this type,
 * active immediately. This guarantees internal flows (room status
 * display, pricing validation, invoices, reschedule) always have a
 * usable rule shape to read from, even if an admin has only ever
 * configured one booking type.
 *
 * IMPORTANT — this fallback is READ-ONLY: it no longer persists
 * isActive:true onto the oldest eligible rule. It used to call
 * prisma.bookingRule.update() here, which meant every background call
 * from an internal flow (e.g. RoomStatusSection's polling on the
 * Booking Rules admin page, which calls this for all three types on
 * every refresh) would silently flip a rule back to Active seconds
 * after a super-admin deliberately set it Inactive — fighting the
 * admin's own explicit choice and defeating the public route's Golden
 * Rule "no current booking rule" guardrail (see getStrictActiveBookingRule
 * above) via a completely different code path. Internal callers still
 * get a rule object to read config off of; they just no longer have
 * the side effect of un-deactivating it in the database.
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
  // rule that's eligible (allows this type), for internal reads only.
  // Deliberately NOT persisted (no .update() call) — see file header
  // note above for why writing this back caused a real bug.
  const oldestEligibleRule = await prisma.bookingRule.findFirst({
    where: { [allowField]: true },
    orderBy: { createdAt: "asc" },
  });
  if (oldestEligibleRule) return oldestEligibleRule;

  // No rule set allows this booking type at all yet — bootstrap one with
  // schema defaults for this type, active immediately. This IS persisted
  // (unlike the fallback above) since it's establishing baseline data
  // for a type that has never had any row at all, not un-toggling an
  // admin's deliberate choice.
  return prisma.bookingRule.create({
    data: { name: `Default Rules (${bookingType})`, isActive: true, [allowField]: true },
  });
}

/**
 * getStrictActiveBookingRule
 * Same lookup as getActiveBookingRule() above, but NEVER auto-creates or
 * auto-activates a fallback rule when none is currently active for this
 * type. Returns null when there is truly no active BookingRule configured
 * for this type.
 *
 * WHY THIS EXISTS: getActiveBookingRule()'s auto-bootstrap behavior is
 * correct for internal flows (pricing validation, invoices, reschedule)
 * that must never crash mid-transaction — but it silently fabricates a
 * rule for the PUBLIC visitor booking flow too, which defeats the
 * intended guardrail: a visitor should never be allowed to proceed past
 * "Continue" on the How to Book calendar if the super-admin hasn't
 * actually configured/activated a booking rule. Used only by the public
 * GET /api/booking-rules route (see getStrictActiveBookingRuleForDateCount
 * below) so that route can correctly return success:false and let
 * HowToBookSection.jsx block with a "no current booking rule" toast
 * instead of quietly booking against an auto-bootstrapped default the
 * admin never configured.
 */
export async function getStrictActiveBookingRule(bookingType = "overnight") {
  const allowField = ALLOW_FIELD_BY_TYPE[bookingType] ?? "allowOvernightStay";
  return prisma.bookingRule.findFirst({
    where: { isActive: true, [allowField]: true },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * getStrictActiveBookingRuleForDateCount
 * Same per-nights matching as getActiveBookingRuleForDateCount() below,
 * but backed by getStrictActiveBookingRule() above — never auto-creates
 * or auto-activates a fallback rule. Returns null when no active rule
 * matches this type (whether or not a specific night count was given).
 */
export async function getStrictActiveBookingRuleForDateCount(bookingType = "overnight", howManySelectedDates = null) {
  const allowField = ALLOW_FIELD_BY_TYPE[bookingType] ?? "allowOvernightStay";

  if (Number.isInteger(howManySelectedDates) && howManySelectedDates > 0) {
    const matchedRule = await prisma.bookingRule.findFirst({
      where: { isActive: true, [allowField]: true, howManySelectedDates },
      orderBy: { updatedAt: "desc" },
    });
    if (matchedRule) return matchedRule;
  }

  return getStrictActiveBookingRule(bookingType);
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