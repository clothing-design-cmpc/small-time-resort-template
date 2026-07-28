/**
 * FILE: app/visitor/rooms/[slug]/not-found.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shown when page.jsx calls notFound() for a slug that doesn't match
 * any active room (deleted, unpublished, or a stale/bad link).
 */
import Link from "next/link";
import "./RoomDetail.css";

export default function RoomNotFound() {
  return (
    <main className="roomDetailMain">
      <div className="roomDetailContainer">
        <h1 className="roomDetailTitle">Room Not Found</h1>
        <p className="roomDetailDescription">
          We couldn&apos;t find what you&apos;re looking for. It may have been moved or is no longer available.
        </p>
        <Link href="/visitor/#rooms" className="roomDetailBookButton">
          Back to Rooms
        </Link>
      </div>
    </main>
  );
}
