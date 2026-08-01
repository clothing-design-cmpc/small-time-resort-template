/**
 * FILE: services/rebookingPolicy.js
 * PURPOSE:
 * Central helper for the Global Rebooking Policy — how many times a
 * single booking may be self-service rebooked (moved to new dates),
 * and what happens once that limit is reached. ONE resort-wide policy
 * (SystemSettings), same singleton-upsert pattern as
 * services/cleaningHours.js uses for SystemSettings.cleaningHours.
 *
 * Every reader/writer goes through here so the reschedule route, the
 * super-admin settings page, the visitor Policies page, and the
 * booking confirmation pages all agree on the exact same values and
 * the exact same human-readable summary text.
 */
import { prisma } from "./prisma.js";

/**
 * getRebookingPolicy
 * Returns the resort-wide Rebooking Policy. Upserts the singleton row
 * on first read so a fresh deployment never throws just because
 * SystemSettings hasn't been touched yet.
 */
export async function getRebookingPolicy() {
  const settings = await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: {
      maxRebookingsAllowed: true,
      rebookingNonRefundableOnFirst: true,
      rebookingLimitAction: true,
    },
  });
  return settings;
}

/**
 * updateRebookingPolicy
 * Saves a new resort-wide Rebooking Policy. Range/enum validation
 * happens in the caller (app/api/superAdmin/settings/rebooking-policy/
 * route.js) before this is called — this function only persists the
 * already-validated values.
 *
 * @param policy        - { maxRebookingsAllowed, rebookingNonRefundableOnFirst, rebookingLimitAction }
 * @param updatedBy     - AdminProfile.id (uid) of the super-admin saving this
 */
export async function updateRebookingPolicy(policy, updatedBy) {
  const data = {
    maxRebookingsAllowed: policy.maxRebookingsAllowed,
    rebookingNonRefundableOnFirst: policy.rebookingNonRefundableOnFirst,
    rebookingLimitAction: policy.rebookingLimitAction,
    updatedAt: new Date(),
    updatedBy: updatedBy ?? null,
  };
  return prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
    select: {
      maxRebookingsAllowed: true,
      rebookingNonRefundableOnFirst: true,
      rebookingLimitAction: true,
    },
  });
}

/**
 * evaluateRebookingEligibility
 * Given a booking (must include rebookCount/isForfeited/
 * isDepositNonRefundable) and the current policy, decides whether a
 * NEW reschedule attempt on it should be allowed right now, and what
 * side effects a successful one would need to apply.
 *
 * Returns:
 *   allowed              - can this reschedule attempt proceed?
 *   reason               - guest-facing message when allowed === false
 *   remainingRebookings  - null if unlimited, otherwise an integer >= 0
 *   isFirstRebook        - true if this would be rebook #1 for this booking
 *   willBecomeNonRefundable - true if a successful reschedule right now
 *                             should flip Booking.isDepositNonRefundable
 */
export function evaluateRebookingEligibility(booking, policy) {
  if (booking.isForfeited) {
    return {
      allowed: false,
      reason: "This booking has already been forfeited after reaching the rebooking limit and can no longer be rebooked.",
      remainingRebookings: 0,
      isFirstRebook: false,
      willBecomeNonRefundable: false,
    };
  }

  const { maxRebookingsAllowed, rebookingNonRefundableOnFirst, rebookingLimitAction } = policy;
  const isFirstRebook = booking.rebookCount === 0;

  if (maxRebookingsAllowed != null && booking.rebookCount >= maxRebookingsAllowed) {
    const reason =
      rebookingLimitAction === "forfeit"
        ? `This booking has already been rebooked the maximum of ${maxRebookingsAllowed} time(s) allowed. It will now be forfeited — the deposit is non-refundable and the dates will be released.`
        : `This booking has already been rebooked the maximum of ${maxRebookingsAllowed} time(s) allowed. No further rebooking is possible, and the deposit remains non-refundable.`;
    return {
      allowed: false,
      reason,
      remainingRebookings: 0,
      isFirstRebook: false,
      willBecomeNonRefundable: false,
      shouldForfeit: rebookingLimitAction === "forfeit",
    };
  }

  return {
    allowed: true,
    reason: null,
    remainingRebookings: maxRebookingsAllowed != null ? maxRebookingsAllowed - booking.rebookCount - 1 : null,
    isFirstRebook,
    willBecomeNonRefundable: isFirstRebook && rebookingNonRefundableOnFirst,
  };
}

/**
 * buildRebookingPolicySummary
 * Turns the resort-wide policy into guest-facing copy — one title +
 * one body paragraph, used as the "Rebooking" item on the visitor
 * Policies page (replacing that page's static fallback copy) and as
 * the short note shown on the booking confirmation screens.
 */
export function buildRebookingPolicySummary(policy) {
  const { maxRebookingsAllowed, rebookingNonRefundableOnFirst, rebookingLimitAction } = policy;

  if (maxRebookingsAllowed == null) {
    return {
      title: "Rebooking",
      body: rebookingNonRefundableOnFirst
        ? "Guests may rebook (change dates) their reservation any number of times through the self-service link on their confirmation email or invoice. The booking deposit becomes non-refundable as soon as the first rebooking is made."
        : "Guests may rebook (change dates) their reservation any number of times through the self-service link on their confirmation email or invoice, subject to availability.",
    };
  }

  const timesLabel = maxRebookingsAllowed === 1 ? "once" : `up to ${maxRebookingsAllowed} times`;
  const nonRefundableClause = rebookingNonRefundableOnFirst
    ? " The booking deposit becomes non-refundable as soon as the first rebooking is made."
    : "";
  const limitClause =
    rebookingLimitAction === "forfeit"
      ? ` Once a booking has been rebooked ${maxRebookingsAllowed} time(s), it may not be rebooked again — any further request will result in the booking being forfeited (the deposit is kept and the dates released).`
      : ` Once a booking has been rebooked ${maxRebookingsAllowed} time(s), it may not be rebooked again and the deposit becomes non-refundable.`;

  return {
    title: "Rebooking",
    body:
      `Guests may rebook (change dates) their reservation ${timesLabel} through the self-service link on their confirmation email or invoice, subject to availability.` +
      nonRefundableClause +
      limitClause,
  };
}
