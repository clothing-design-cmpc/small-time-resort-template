/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Booking Rules & Configuration list route. Fetches the room list
 * server-side (fresh, no cache) since BookingRulesListClient's
 * Seasonal Pricing sub-section needs a room picker, then hands off to
 * BookingRulesListClient (Client Component), which owns the rule-set
 * DataTable plus the Seasonal Pricing / Blackout Dates / Room Status /
 * Pending Hold / Rebooking Policy sub-sections underneath.
 */
import { prisma } from "@/services/prisma";
import "./BookingRules.css";
import BookingRulesListClient from "./BookingRulesListClient";

export const metadata = {
  title: "Booking Rules | Super-Admin | your-private-resort",
};

export default async function BookingRulesPage() {
  const roomRecords = await prisma.room.findMany({
    select: { id: true, name: true, pricePerNight: true, dayTourPrice: true, nightTourPrice: true },
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
