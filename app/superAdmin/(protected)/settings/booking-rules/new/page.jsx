/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/new/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create-rule-set route. Fetches the room list server-side (fresh, no
 * cache) so BookingRuleForm's Preview Impact panel has a sample room to
 * calculate against, plus the active Amenity catalog and the active
 * Resort Shop product catalog so the Package Inclusions checklist has
 * something to pick from, then hands off to the shared BookingRuleForm
 * in create mode.
 */
import { prisma } from "@/services/prisma";
import BookingRuleForm from "../BookingRuleForm";

export const metadata = {
  title: "Create Booking Rule Set | Super-Admin | your-private-resort",
};

export default async function NewBookingRulePage() {
  const [roomRecords, amenities, productRecords] = await Promise.all([
    prisma.room.findMany({
      select: { id: true, name: true, pricePerNight: true },
      orderBy: { sortOrder: "asc" },
    }),
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
  const rooms = roomRecords.map((room) => ({
    ...room,
    pricePerNight: Number(room.pricePerNight),
    dayTourPrice: Number(room.dayTourPrice),
    nightTourPrice: Number(room.nightTourPrice),
  }));
  const products = productRecords.map((product) => ({ ...product, price: Number(product.price) }));

  return <BookingRuleForm existingRule={null} rooms={rooms} amenities={amenities} products={products} />;
}
