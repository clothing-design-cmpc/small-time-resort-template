/**
 * FILE: app/visitor/rooms/[slug]/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Room detail page. Previously this route did not exist at all — the
 * "View Room" link on every FeaturedRoomsSection card already pointed
 * here, but hitting it 404'd. This page is also where a room's full
 * RoomImage gallery finally reaches the visitor site (the card only has
 * room for a single thumbnail preview + photo-count badge; the full set
 * is shown here) — superadmin-audit-followup.txt Priority 2 item 4.
 *
 * DATA FLOW:
 * 1. Visitor clicks "View Room" on a room card -> /visitor/rooms/{slug}
 * 2. Server Component reads the Room row + its roomImages relation
 *    directly via Prisma (same pattern app/visitor/gallery/page.jsx and
 *    already use) — isActive rooms only, images ordered
 *    by displayOrder
 * 3. notFound() if the slug doesn't match any active room (Rule 31.10)
 * 4. generateMetadata (Rule 31.9) sets a per-room title/description
 * 5. Room info + gallery are handed to RoomDetailClient, a small Client
 *    Component that owns which photo is the current "main" image and
 *    the full-size lightbox open/closed state
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/services/prisma";
import RoomDetailClient from "./RoomDetailClient";
import "./RoomDetail.css";

/**
 * getRoom
 * Single shared query used by both generateMetadata and the page body,
 * so the room is only fetched once per request thanks to Next.js's
 * automatic fetch/query memoization within a single render pass.
 */
async function getRoom(slug) {
  return prisma.room.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      pricePerNight: true,
      capacity: true,
      bedType: true,
      imageUrl: true,
      roomImages: {
        orderBy: { displayOrder: "asc" },
        select: { id: true, imageUrl: true, caption: true },
      },
    },
  });
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const room = await getRoom(slug).catch(() => null);

  if (!room) {
    return { title: "Room Not Found | your-private-resort" };
  }

  return {
    title: `${room.name} | your-private-resort`,
    description: room.description || `Book ${room.name} at your-private-resort.`,
    openGraph: {
      title: room.name,
      description: room.description || `Book ${room.name} at your-private-resort.`,
      images: room.imageUrl ? [room.imageUrl] : [],
    },
  };
}

/* Formats a number as Philippine Peso — same formatter FeaturedRoomsSection uses */
function formatPrice(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default async function RoomDetailPage({ params }) {
  const { slug } = await params;
  const room = await getRoom(slug).catch(() => null);

  if (!room) {
    notFound();
  }

  // The main image plus every gallery photo, deduped by URL, in one
  // ordered list — RoomDetailClient doesn't need to know which one was
  // the room's single "main image" vs. an added gallery photo.
  const galleryImages = [
    { id: "main", imageUrl: room.imageUrl, caption: room.name },
    ...room.roomImages.filter((image) => image.imageUrl !== room.imageUrl),
  ].filter((image) => image.imageUrl);

  return (
    <main className="roomDetailMain">
      <div className="roomDetailContainer">
        <Link href="/visitor/#rooms" className="roomDetailBackLink">
          ← Back to Rooms
        </Link>

        <RoomDetailClient images={galleryImages} roomName={room.name} />

        <div className="roomDetailInfo">
          <div className="roomDetailMeta">
            <span className="roomDetailBedType">{room.bedType}</span>
            <span className="roomDetailGuests">Up to {room.capacity} guests</span>
          </div>
          <h1 className="roomDetailTitle">{room.name}</h1>
          {room.description && <p className="roomDetailDescription">{room.description}</p>}

          <div className="roomDetailFooter">
            <div className="roomDetailPrice">
              <span className="roomDetailPriceAmount">{formatPrice(room.pricePerNight)}</span>
              <span className="roomDetailPriceLabel">/ night</span>
            </div>
            {/* Same destination as Header.jsx's "Book Now" CTA
                (/visitor#how-to-book) — routes through the homepage
                availability calendar (pick date(s) -> pick room ->
                /visitor/booking) instead of skipping straight to the
                booking form with no dates selected yet. */}
            <Link href="/visitor#how-to-book" className="roomDetailBookButton">
              Book This Room
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}