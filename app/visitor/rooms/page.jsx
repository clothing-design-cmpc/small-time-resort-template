/**
 * FILE: app/visitor/rooms/page.jsx
 * ROLE: Visitor — public, standalone page (same tier as /visitor/activities)
 *
 * PURPOSE:
 * Full room listing. Previously this page did not exist at all — only
 * the dynamic app/visitor/rooms/[slug]/page.jsx (single room detail)
 * existed, so the homepage's "View all rooms →" link and the header
 * nav's "Rooms" link both 404'd. This lists every active Room (not
 * just the up-to-3 curated in SystemSettings.featuredRoomIds that the
 * homepage grid shows), same reasoning as FeaturedRoomsSection's
 * comment on why that endpoint is scoped separately.
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor/rooms" (linked from the header nav and
 *    from FeaturedRoomsSection's "View all rooms →" link)
 * 2. Server Component reads the Room table directly via Prisma (same
 *    pattern app/visitor/activities/page.jsx already uses), scoped to
 *    isActive rooms, ordered by sortOrder — no client interactivity
 *    needed, so no separate Client Component required
 * 3. Reuses the .roomCard styles from FeaturedRoomsSection.css (global
 *    CSS, not CSS Modules, so importing it here is safe) plus its own
 *    page-level wrapper styles in Rooms.css
 */
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/services/prisma";
import "@/components/sections/FeaturedRoomsSection.css";
import "./Rooms.css";

export const metadata = {
  title: "Rooms | your-private-resort",
  description: "Browse every room at your-private-resort.",
};

/* Formats a number as Philippine Peso */
function formatPrice(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default async function VisitorRoomsPage() {
  const rooms = await prisma.room
    .findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        pricePerNight: true,
        capacity: true,
        bedType: true,
        imageUrl: true,
        roomImages: {
          orderBy: { displayOrder: "asc" },
          select: { id: true },
        },
      },
    })
    .catch(() => []);

  return (
    <main className="roomsPageMain">
      <div className="roomsPageHeader">
        <span className="roomsPageEyebrow">Accommodations</span>
        <h1 className="roomsPageTitle">All Rooms</h1>
        <p className="roomsPageSubtitle">
          Every room we have to offer, at a glance.
        </p>
      </div>

      {/* Empty state — no active rooms yet (Rule 25.3) */}
      {rooms.length === 0 && (
        <div className="featuredRoomsEmptyState">
          <p className="featuredRoomsEmptyTitle">No rooms available yet.</p>
          <p className="featuredRoomsEmptySubtitle">Check back soon — new rooms are added regularly.</p>
        </div>
      )}

      {rooms.length > 0 && (
        <div className="featuredRoomsGrid roomsPageGrid">
          {rooms.map((room) => (
            <article key={room.id} className="roomCard">
              <div className="roomCardImageWrapper">
                {room.imageUrl ? (
                  <Image
                    src={room.imageUrl}
                    alt={room.name}
                    fill
                    className="roomCardImage"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  />
                ) : null}
                {room.roomImages?.length > 0 && (
                  <span className="roomCardPhotoBadge">{room.roomImages.length + 1} photos</span>
                )}
              </div>

              <div className="roomCardBody">
                <div className="roomCardMeta">
                  <span className="roomCardBedType">{room.bedType}</span>
                  <span className="roomCardGuests">Up to {room.capacity} guests</span>
                </div>
                <h2 className="roomCardName">{room.name}</h2>
                {room.description && <p className="roomCardDescription">{room.description}</p>}

                <div className="roomCardFooter">
                  <div className="roomCardPrice">
                    <span className="roomCardPriceAmount">{formatPrice(room.pricePerNight)}</span>
                    <span className="roomCardPriceLabel">/ night</span>
                  </div>
                  <Link href={`/visitor/rooms/${room.slug}`} className="roomCardLink">
                    View Room
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}