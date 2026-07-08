/**
 * FILE: app/superAdmin/(protected)/content/rooms/[roomId]/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Edit-room route. Fetches the room and the amenities list server-side
 * (fresh, no cache), then hands off to the shared RoomForm in edit mode.
 * Calls notFound() if the room ID doesn't exist.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import RoomForm from "../RoomForm";

export async function generateMetadata({ params }) {
  const { roomId } = await params;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  return { title: room ? `Edit ${room.name} | Super-Admin` : "Room Not Found | Super-Admin" };
}

export default async function EditRoomPage({ params }) {
  const { roomId } = await params;

  const [room, amenities] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.amenity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  if (!room) {
    notFound();
  }

  // Decimal fields from Prisma aren't serializable as-is across the
  // Server -> Client Component boundary — convert to a plain number.
  const serializedRoom = { ...room, pricePerNight: Number(room.pricePerNight) };

  return <RoomForm existingRoom={serializedRoom} amenities={amenities} />;
}
