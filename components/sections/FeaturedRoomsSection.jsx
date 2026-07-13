/**
 * FILE: components/sections/FeaturedRoomsSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Displays room cards on the homepage for every Room the super-admin has
 * marked as featured. Each card links to the room detail page.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after Hero and About sections
 * 2. On mount, usePublicRooms(true) fetches GET /api/rooms?featured=true —
 *    the same Rooms data the super-admin manages under Content > Rooms,
 *    filtered to isActive + isFeatured. Replaces the old hardcoded
 *    featuredRooms constant that lived directly in this file.
 * 3. Renders a loading skeleton, an error state with retry, an empty
 *    state (no rooms marked featured yet), or the real grid (Rule 25)
 */
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePublicRooms } from "@/hooks/usePublicRooms";
import ScrollReveal from "@/components/shared/motion/ScrollReveal";
import { RevealGroup, RevealItem } from "@/components/shared/motion/RevealGroup";
import "./FeaturedRoomsSection.css";

/* Formats a number as Philippine Peso */
function formatPrice(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function FeaturedRoomsSection() {
  const { rooms, isLoading, error, refetchRooms } = usePublicRooms(true);

  return (
    <section className="featuredRoomsSection" id="rooms">
      <div className="featuredRoomsContainer">
        {/* Section header */}
        <ScrollReveal as="div" className="featuredRoomsHeader">
          <span className="featuredRoomsEyebrow">Accommodations</span>
          <h2 className="featuredRoomsTitle">Rooms & Villas</h2>
          <p className="featuredRoomsSubtitle">
            A small collection — every villa chosen for its setting, its quiet, and what it keeps out.
          </p>
        </ScrollReveal>

        {/* Loading skeleton — mirrors the 3-card grid shape */}
        {isLoading && (
          <div className="featuredRoomsGrid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="roomCardSkeleton skeletonBlock" />
            ))}
          </div>
        )}

        {/* Error state — fetch failed, offer a retry */}
        {!isLoading && error && (
          <div className="featuredRoomsErrorState">
            <p className="featuredRoomsErrorMessage">
              We couldn&apos;t load the rooms right now. Please try again.
            </p>
            <button type="button" className="featuredRoomsRetryButton" onClick={refetchRooms}>
              Try again
            </button>
          </div>
        )}

        {/* Empty state — no rooms marked as featured yet */}
        {!isLoading && !error && rooms.length === 0 && (
          <div className="featuredRoomsEmptyState">
            <p className="featuredRoomsEmptyTitle">No featured rooms yet.</p>
            <p className="featuredRoomsEmptySubtitle">
              Check back soon — new villas are added regularly.
            </p>
          </div>
        )}

        {/* Room card grid */}
        {!isLoading && !error && rooms.length > 0 && (
          <RevealGroup as="div" className="featuredRoomsGrid">
            {rooms.map((room) => (
              <RevealItem as="article" key={room.id} className="roomCard" hoverLift>
                {/* Room image */}
                <div className="roomCardImageWrapper">
                  <Image
                    src={room.imageUrl}
                    alt={room.name}
                    fill
                    className="roomCardImage"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  />
                </div>

                {/* Room info */}
                <div className="roomCardBody">
                  <div className="roomCardMeta">
                    <span className="roomCardBedType">{room.bedType}</span>
                    <span className="roomCardGuests">Up to {room.capacity} guests</span>
                  </div>
                  <h3 className="roomCardName">{room.name}</h3>
                  <p className="roomCardDescription">{room.description}</p>

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
              </RevealItem>
            ))}
          </RevealGroup>
        )}

        {/* See all rooms link */}
        <ScrollReveal as="div" className="featuredRoomsViewAll" delay={0.1}>
          <Link href="/visitor/rooms" className="featuredRoomsViewAllLink">
            View all rooms & villas →
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
