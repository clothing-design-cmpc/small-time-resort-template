/**
 * FILE: services/bookingRules.js
 * PURPOSE:
 * Resolves the single BookingRule that is currently in effect resort-
 * wide. Shared by app/api/booking-rules/route.js (public, read-only)
 * and services/bookingPricing.js (validation + pricing), so both always
 * agree on which rule set is "the" active one.
 *
 * Since super-admin can now create multiple named BookingRule sets
 * (Task: "multiple booking rules, not just one"), exactly one of them
 * is marked isActive — this file is the single place that decides what
 * happens if none is marked active yet (brand-new project, or an admin
 * deleted the active one without picking a replacement).
 */
import { prisma } from "@/services/prisma";

/**
 * getActiveBookingRule
 * Returns the BookingRule row with isActive = true. If none exists yet
 * (first run on a fresh project) or somehow none is marked active,
 * falls back to the oldest existing rule, or creates a "Default Rules"
 * row with schema defaults and activates it — so the visitor booking
 * flow never breaks just because an admin hasn't opened Settings yet.
 */
export async function getActiveBookingRule() {
  const activeRule = await prisma.bookingRule.findFirst({ where: { isActive: true } });
  if (activeRule) return activeRule;

  // No active rule — recover using whatever oldest rule already exists,
  // rather than silently creating a duplicate "Default Rules" row.
  const oldestRule = await prisma.bookingRule.findFirst({ orderBy: { createdAt: "asc" } });
  if (oldestRule) {
    return prisma.bookingRule.update({ where: { id: oldestRule.id }, data: { isActive: true } });
  }

  // No rules exist at all yet — bootstrap the very first one with
  // schema defaults, active immediately.
  return prisma.bookingRule.create({ data: { name: "Default Rules", isActive: true } });
}
