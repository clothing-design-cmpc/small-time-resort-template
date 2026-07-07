/**
 * FILE: app/visitor/page.jsx
 * ROLE: Visitor — public landing page
 *
 * PURPOSE:
 * Homepage that renders all visitor sections in sequence:
 * Hero → About → Featured Rooms → Amenities → Mini Store →
 * Testimonials → Booked Dates → CTA
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor"
 * 2. Server-side sections render without data fetching (static placeholders)
 * 3. BookedDatesSection and CTASection are Client Components — they own
 *    interactive carousel state locally, no SSR data needed
 */
import Hero from "@/components/Hero";
import About from "@/components/About";
import FeaturedRoomsSection from "@/components/sections/FeaturedRoomsSection";
import AmenitiesHighlightSection from "@/components/sections/AmenitiesHighlightSection";
import MiniStoreSection from "@/components/sections/MiniStoreSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import BookedDatesSection from "@/components/sections/BookedDatesSection";
import CTASection from "@/components/sections/CTASection";

export const metadata = {
  title: "Villa Azure Resort | Home",
  description: "A private resort offering an intimate escape — rooms, amenities, and a quiet shoreline.",
  openGraph: {
    title: "Villa Azure Resort",
    description: "A private resort offering an intimate escape.",
    images: ["/images/og-villa-azure.jpg"],
  },
};

export default function VisitorHomePage() {
  return (
    <main>
      <Hero />
      <About />
      <FeaturedRoomsSection />
      <AmenitiesHighlightSection />
      <MiniStoreSection />
      <TestimonialsSection />
      <BookedDatesSection />
      <CTASection />
    </main>
  );
}
