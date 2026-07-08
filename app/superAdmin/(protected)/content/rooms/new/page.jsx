/**
 * FILE: app/superAdmin/(protected)/content/rooms/new/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create-room route. Fetches the amenities list server-side (fresh,
 * no cache) so RoomForm's amenity checkboxes are ready on first paint,
 * then hands off to the shared RoomForm in create mode.
 */
import { prisma } from "@/services/prisma";
import RoomForm from "../RoomForm";

export const metadata = {
  title: "Add Room | Super-Admin | Villa Azure Resort",
};

export default async function NewRoomPage() {
  const amenities = await prisma.amenity.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return <RoomForm existingRoom={null} amenities={amenities} />;
}
