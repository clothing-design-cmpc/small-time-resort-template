/**
 * FILE: components/sections/AmenitiesHighlightSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shows top 8 resort amenities as an icon + label grid on the homepage.
 * Static content — no data fetching needed for the homepage highlight.
 * Full amenity list lives on /visitor/amenities.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after FeaturedRoomsSection
 * 2. No data fetching — static amenity list
 */
import "./AmenitiesHighlightSection.css";

/* Inline SVG icons — single set, consistent stroke style */
const WifiIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const PoolIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12h20" /><path d="M2 6c1.5 0 3 1 4 2s2.5 2 4 2 2.5-1 4-2 2.5-2 4-2" />
    <path d="M2 18c1.5 0 3 1 4 2s2.5 2 4 2 2.5-1 4-2 2.5-2 4-2" />
  </svg>
);

const BeachIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 12c0 4.69-3.58 8.5-8 8.5" /><path d="M2 12c0-4.69 3.58-8.5 8-8.5" />
    <path d="M12 3v18" /><path d="M3 20h18" />
  </svg>
);

const AcIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 4v16m5-16v16M4 9.5h16M4 14.5h16" />
  </svg>
);

const DeskIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const RestaurantIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" /><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);

const SpaIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22c4.97 0 9-2.69 9-6s-4.03-6-9-6-9 2.69-9 6 4.03 6 9 6Z" />
    <path d="M15.71 9.71C13.93 8.13 12 5 12 2c0 3-1.93 6.13-3.71 7.71" />
  </svg>
);

const ParkingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
  </svg>
);

const amenities = [
  { id: "wifi", label: "Free WiFi", description: "High-speed in all villas", Icon: WifiIcon },
  { id: "pool", label: "Swimming Pool", description: "Freshwater pool & lounge", Icon: PoolIcon },
  { id: "beach", label: "Beach Access", description: "Private shoreline", Icon: BeachIcon },
  { id: "ac", label: "Air Conditioning", description: "All rooms climate-controlled", Icon: AcIcon },
  { id: "desk", label: "24/7 Front Desk", description: "Always available on-site", Icon: DeskIcon },
  { id: "restaurant", label: "Restaurant", description: "On-site dining, local cuisine", Icon: RestaurantIcon },
  { id: "spa", label: "Spa Services", description: "By appointment", Icon: SpaIcon },
  { id: "parking", label: "Free Parking", description: "Secure on-property", Icon: ParkingIcon },
];

export default function AmenitiesHighlightSection() {
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
          {amenities.map(({ id, label, description, Icon }) => (
            <div key={id} className="amenityHighlightCard">
              <div className="amenityHighlightIcon" aria-hidden="true">
                <Icon />
              </div>
              <div className="amenityHighlightText">
                <span className="amenityHighlightLabel">{label}</span>
                <span className="amenityHighlightDescription">{description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
