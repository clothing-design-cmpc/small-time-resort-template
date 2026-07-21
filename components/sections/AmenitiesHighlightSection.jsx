/**
 * FILE: components/sections/AmenitiesHighlightSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shows top resort amenities as an icon + label grid on the homepage.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after FeaturedRoomsSection
 * 2. Server Component reads the Amenity table directly via Prisma (no
 *    separate public API route needed — same pattern
 *    app/visitor/policies/page.jsx already uses for SystemSettings),
 *    scoped to isActive amenities, ordered by sortOrder, capped at 8
 *    for the homepage highlight strip
 * 3. Each amenity's stored Lucide icon name (set by the admin via
 *    IconPicker under Content > Amenities) is resolved to its Lucide
 *    component with getIconByName — the same lookup the admin form uses
 * 4. Fails safe: if the query errors or no amenities are marked active
 *    yet, falls back to a small set of sensible default amenities so
 *    this section is never blank before an admin has added any
 */
import { prisma } from "@/services/prisma";
import { getIconByName } from "@/components/superAdmin/IconPicker";
import "./AmenitiesHighlightSection.css";

/* Shown only as a fallback — before any admin has added amenities, or if
   the query fails — so this section is never blank on a fresh install. */
const DEFAULT_AMENITIES = [
  { id: "wifi", name: "Free WiFi", description: "High-speed in all villas", icon: "wifi" },
  { id: "pool", name: "Swimming Pool", description: "Freshwater pool & lounge", icon: "waves" },
  { id: "ac", name: "Air Conditioning", description: "All rooms climate-controlled", icon: "wind" },
  { id: "restaurant", name: "Restaurant", description: "On-site dining, local cuisine", icon: "utensils" },
  { id: "spa", name: "Spa Services", description: "By appointment", icon: "sparkles" },
  { id: "parking", name: "Free Parking", description: "Secure on-property", icon: "parking-circle" },
];

export default async function AmenitiesHighlightSection() {
  // Read-only fetch of active amenities. Fails safe to an empty array so
  // this public page never 500s just because the query hiccups.
  const amenities = await prisma.amenity
    .findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      take: 8,
    })
    .catch(() => []);

  const displayAmenities = amenities.length > 0 ? amenities : DEFAULT_AMENITIES;

  return (
    <section className="amenitiesHighlightSection" id="amenities">
      <div className="amenitiesHighlightContainer">
        <div className="amenitiesHighlightHeader">
          <span className="amenitiesHighlightEyebrow">What&apos;s Included</span>
          <h2 className="amenitiesHighlightTitle">Resort Amenities</h2>
          <p className="amenitiesHighlightSubtitle">
            Everything you need for an unhurried stay — nothing you don&apos;t.
          </p>
        </div>

        <div className="amenitiesHighlightGrid">
          {displayAmenities.map((amenity) => {
            const Icon = getIconByName(amenity.icon);
            return (
              <div key={amenity.id} className="amenityHighlightCard">
                <div className="amenityHighlightIcon" aria-hidden="true">
                  <Icon size={24} strokeWidth={1.5} />
                </div>
                <div className="amenityHighlightText">
                  <span className="amenityHighlightLabel">{amenity.name}</span>
                  {amenity.description && (
                    <span className="amenityHighlightDescription">{amenity.description}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
