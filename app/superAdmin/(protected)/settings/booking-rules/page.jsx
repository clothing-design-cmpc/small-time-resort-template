/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Booking Rules list route. Fetches the room list server-side (fresh,
 * no cache) so the Seasonal Pricing / Blackout Dates sub-sections have
 * rooms to work against, then hands off to BookingRulesListClient which
 * fetches and renders the rule sets themselves.
 */
import { prisma } from "@/services/prisma";
import BookingRulesListClient from "./BookingRulesListClient";

export const metadata = {
  title: "Booking Rules & Configuration | Super-Admin | your-private-resort",
};

export default async function BookingRulesPage() {
  const roomRecords = await prisma.room.findMany({
    select: { id: true, name: true, pricePerNight: true },
    orderBy: { sortOrder: "asc" },
  });

  // Decimal fields from Prisma aren't serializable as-is across the
  // Server -> Client Component boundary — convert to plain numbers.
  const rooms = roomRecords.map((room) => ({
    ...room,
    pricePerNight: Number(room.pricePerNight),
    dayTourPrice: Number(room.dayTourPrice),
    nightTourPrice: Number(room.nightTourPrice),
  }));

  return <BookingRulesListClient rooms={rooms} />;
}