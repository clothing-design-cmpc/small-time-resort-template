/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/new/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create-rule-set route. Fetches the room list server-side (fresh, no
 * cache) so BookingRuleForm's Preview Impact panel has a sample room to
 * calculate against, then hands off to the shared BookingRuleForm in
 * create mode.
 */
import { prisma } from "@/services/prisma";
import BookingRuleForm from "../BookingRuleForm";

export const metadata = {
  title: "Create Booking Rule Set | Super-Admin | Villa Azure Resort",
};

export default async function NewBookingRulePage() {
  const roomRecords = await prisma.room.findMany({
    select: { id: true, name: true, pricePerNight: true },
    orderBy: { sortOrder: "asc" },
  });
  const rooms = roomRecords.map((room) => ({ ...room, pricePerNight: Number(room.pricePerNight) }));

  return <BookingRuleForm existingRule={null} rooms={rooms} />;
}
