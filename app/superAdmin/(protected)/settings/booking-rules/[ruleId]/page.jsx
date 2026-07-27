/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/[ruleId]/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Edit-rule-set route. Fetches the rule set, the room list, the active
 * Amenity catalog, and the active Resort Shop product catalog
 * server-side (fresh, no cache), then hands off to the shared
 * BookingRuleForm in edit mode. Calls notFound() if the rule ID doesn't
 * exist.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import BookingRuleForm from "../BookingRuleForm";

export async function generateMetadata({ params }) {
  const { ruleId } = await params;
  const rule = await prisma.bookingRule.findUnique({ where: { id: ruleId } });
  return { title: rule ? `Edit ${rule.name} | Super-Admin` : "Rule Set Not Found | Super-Admin" };
}

export default async function EditBookingRulePage({ params }) {
  const { ruleId } = await params;

  const [rule, roomRecords, amenities, productRecords] = await Promise.all([
    prisma.bookingRule.findUnique({ where: { id: ruleId } }),
    prisma.room.findMany({ select: { id: true, name: true, pricePerNight: true }, orderBy: { sortOrder: "asc" } }),
    prisma.amenity.findMany({
      where: { isActive: true },
      select: { id: true, name: true, icon: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.storeProduct.findMany({
      where: { isActive: true },
      select: { id: true, name: true, price: true, category: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!rule) {
    notFound();
  }

  // Decimal fields from Prisma aren't serializable as-is across the
  // Server -> Client Component boundary — convert to plain numbers.
  const serializedRule = {
    ...rule,
    hourlyChargeAmount: Number(rule.hourlyChargeAmount),
    dayTourPricePerGuest: Number(rule.dayTourPricePerGuest),
    nightTourPricePerGuest: Number(rule.nightTourPricePerGuest),
  };
  const rooms = roomRecords.map((room) => ({ ...room, pricePerNight: Number(room.pricePerNight) }));
  const products = productRecords.map((product) => ({ ...product, price: Number(product.price) }));

  return <BookingRuleForm existingRule={serializedRule} rooms={rooms} amenities={amenities} products={products} />;
}
