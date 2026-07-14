/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Booking Rules & Configuration (blueprint Page 7). Lists every named
 * rule set the super-admin has created, shows which one is active, and
 * links to create/edit individual rule sets — plus the resort's
 * Seasonal Pricing and Blackout Dates sub-sections, which are per-room
 * and apply regardless of which rule set is active.
 *
 * DATA FLOW:
 * 1. Fetches the room list server-side (fresh, no cache) since both
 *    Seasonal Pricing and Blackout Dates need a room picker
 * 2. Hands off to BookingRulesListClient (Client Component), which owns
 *    the rule set list + seasonal pricing + blackout sub-lists
 */
import { prisma } from "@/services/prisma";
import "./BookingRules.css";
import BookingRulesListClient from "./BookingRulesListClient";

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

  return <BookingRulesListClient rooms={rooms} />;
}
