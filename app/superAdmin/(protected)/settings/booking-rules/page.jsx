/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Booking Rules & Configuration (blueprint Page 7). Controls resort-
 * wide booking logic: general settings, booking types, cancellation
 * policy, deposit, pricing modifiers, seasonal pricing, and blackout
 * dates.
 *
 * DATA FLOW:
 * 1. Fetches the room list server-side (fresh, no cache) since both
 *    Seasonal Pricing and Blackout Dates need a room picker
 * 2. Hands off to BookingRulesClient (Client Component), which owns
 *    the actual settings form + seasonal pricing + blackout sub-lists
 */
import { prisma } from "@/services/prisma";
import "./BookingRules.css";
import BookingRulesClient from "./BookingRulesClient";

export const metadata = {
  title: "Booking Rules | Super-Admin | Villa Azure Resort",
};

export default async function BookingRulesPage() {
  const roomRecords = await prisma.room.findMany({
    select: { id: true, name: true, pricePerNight: true },
    orderBy: { sortOrder: "asc" },
  });

  // Decimal fields from Prisma aren't serializable as-is across the
  // Server -> Client Component boundary — convert to a plain number.
  const rooms = roomRecords.map((room) => ({ ...room, pricePerNight: Number(room.pricePerNight) }));

  return <BookingRulesClient rooms={rooms} />;
}
