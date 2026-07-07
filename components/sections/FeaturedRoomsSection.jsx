/**
 * FILE: components/sections/FeaturedRoomsSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Displays 3 featured room cards on the homepage. Static placeholder data
 * used until Supabase + Prisma is connected. Each card links to the room
 * detail page.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after Hero and About sections
 * 2. Currently uses hardcoded placeholder rooms — swap with useRooms() hook
 *    once Supabase is configured
 * 3. No user interaction beyond clicking a card to navigate
 */
import Link from "next/link";
import Image from "next/image";
import "./FeaturedRoomsSection.css";

/* Placeholder rooms — replace with DB data once Supabase is connected */
const featuredRooms = [
  {
    id: "deluxe-ocean-view",
    slug: "deluxe-ocean-view",
    name: "Deluxe Ocean View",
    description: "A spacious villa with unobstructed ocean views and a private balcony. Perfect for couples seeking stillness and open water.",
    pricePerNight: 5000,
    maxGuests: 4,
    bedType: "King Bed",
    mainImageUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "beachfront-villa",
    slug: "beachfront-villa",
    name: "Beachfront Villa",
    description: "Wake up 20 steps from the waterline. This two-bedroom villa is our most private offering — no neighbors in sight.",
    pricePerNight: 12000,
    maxGuests: 4,
    bedType: "2 Bedrooms",
    mainImageUrl: "https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "family-suite",
    slug: "family-suite",
    name: "Family Suite",
    description: "Generous space for families with a king bed and two singles. A shared living area that feels like home, not a hotel.",
    pricePerNight: 7500,
    maxGuests: 6,
    bedType: "1 King + 2 Singles",
    mainImageUrl: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80",
  },
];

/* Formats a number as Philippine Peso */
function formatPrice(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function FeaturedRoomsSection() {
  return (
    <section className="featuredRoomsSection" id="rooms">
      <div className="featuredRoomsContainer">
        {/* Section header */}
        <div className="featuredRoomsHeader">
          <span className="featuredRoomsEyebrow">Accommodations</span>
          <h2 className="featuredRoomsTitle">Rooms & Villas</h2>
          <p className="featuredRoomsSubtitle">
            A small collection — every villa chosen for its setting, its quiet, and what it keeps out.
          </p>
        </div>

        {/* Room card grid */}
        <div className="featuredRoomsGrid">
          {featuredRooms.map((room) => (
            <article key={room.id} className="roomCard">
              {/* Room image */}
              <div className="roomCardImageWrapper">
                <Image
                  src={room.mainImageUrl}
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
                  <span className="roomCardGuests">Up to {room.maxGuests} guests</span>
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
            </article>
          ))}
        </div>

        {/* See all rooms link */}
        <div className="featuredRoomsViewAll">
          <Link href="/visitor/rooms" className="featuredRoomsViewAllLink">
            View all rooms & villas →
          </Link>
        </div>
      </div>
    </section>
  );
}
