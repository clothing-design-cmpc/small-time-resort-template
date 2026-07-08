/**
 * FILE: app/superAdmin/(protected)/content/rooms/[roomId]/not-found.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Shown when EditRoomPage calls notFound() for a room ID that no
 * longer exists (deleted, or a stale/bad link).
 */
import Link from "next/link";
import "../Rooms.css";

export default function RoomNotFound() {
  return (
    <section className="roomsSection">
      <h1 className="roomsTitle">Room Not Found</h1>
      <p>We couldn&apos;t find what you&apos;re looking for. It may have been deleted.</p>
      <Link href="/superAdmin/content/rooms" className="roomsAddButton">
        Back to Rooms
      </Link>
    </section>
  );
}
