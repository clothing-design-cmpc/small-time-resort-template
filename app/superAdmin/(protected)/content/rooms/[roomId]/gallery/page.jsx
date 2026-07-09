/**
 * FILE: app/superAdmin/(protected)/content/rooms/[roomId]/gallery/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Room Gallery sub-page (blueprint Page 1 gap). Fetches the room
 * server-side (fresh, no cache) just to confirm it exists and to show
 * its name in the header, then hands off to RoomGalleryClient, which
 * owns the actual image list via useRoomGallery(). Calls notFound()
 * if the room ID doesn't exist.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import RoomGalleryClient from "./RoomGalleryClient";

export async function generateMetadata({ params }) {
  const { roomId } = await params;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  return { title: room ? `${room.name} Gallery | Super-Admin` : "Room Not Found | Super-Admin" };
}

export default async function RoomGalleryPage({ params }) {
  const { roomId } = await params;

  const room = await prisma.room.findUnique({ where: { id: roomId } });

  if (!room) {
    notFound();
  }

  return <RoomGalleryClient roomId={roomId} roomName={room.name} />;
}
