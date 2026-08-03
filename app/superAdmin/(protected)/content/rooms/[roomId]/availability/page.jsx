/**
 * FILE: app/superAdmin/(protected)/content/rooms/[roomId]/availability/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Room Availability Calendar sub-page (blueprint Page 1 gap). Fetches
 * the room and its upcoming confirmed bookings server-side (fresh, no
 * cache), then hands off to AvailabilityCalendarClient, which owns the
 * blackout-date toggling and bulk actions. Calls notFound() if the
 * room ID doesn't exist.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import AvailabilityCalendarClient from "./AvailabilityCalendarClient";

export async function generateMetadata({ params }) {
  const { roomId } = await params;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  return { title: room ? `${room.name} Availability | Super-Admin` : "Room Not Found | Super-Admin" };
}

export default async function RoomAvailabilityPage({ params }) {
  const { roomId } = await params;

  const room = await prisma.room.findUnique({ where: { id: roomId } });

  if (!room) {
    notFound();
  }

  // Read-only reference list for the admin — every booking still
  // holding a date for this room, soonest first. Includes "pending"
  // bookings whose hold hasn't expired (or is capped, per
  // pendingHoldCapped) alongside "confirmed" ones — matching the exact
  // same rule app/api/bookings/dates/route.js already uses to decide
  // what blocks a date on the public calendar. Without this, a fresh
  // pending booking (e.g. "+1" on the Bookings sidebar badge) would
  // occupy the date but never appear here or color the calendar cell
  // "Booked," making it look like nothing is scheduled.
  const upcomingBookings = await prisma.booking.findMany({
    where: {
      roomId,
      checkOutDate: { gte: new Date(new Date().toDateString()) },
      OR: [
        { status: "confirmed" },
        { status: "pending", OR: [{ pendingExpiresAt: { gt: new Date() } }, { pendingHoldCapped: true }] },
      ],
    },
    orderBy: { checkInDate: "asc" },
    select: { id: true, guestName: true, checkInDate: true, checkOutDate: true, numberOfGuests: true, status: true },
  });

  // Dates aren't serializable as-is across the Server -> Client
  // Component boundary — convert to plain "YYYY-MM-DD" strings.
  const serializedBookings = upcomingBookings.map((booking) => ({
    ...booking,
    checkInDate: booking.checkInDate.toISOString().slice(0, 10),
    checkOutDate: booking.checkOutDate.toISOString().slice(0, 10),
  }));

  return <AvailabilityCalendarClient roomId={roomId} roomName={room.name} upcomingBookings={serializedBookings} />;
}
