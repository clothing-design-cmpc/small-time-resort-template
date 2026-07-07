/**
 * FILE: app/visitor/page.jsx
 * ROLE: Visitor — public landing page
 *
 * PURPOSE:
 * Homepage that renders all visitor sections in sequence:
 * Hero → About → Featured Rooms → Amenities → Testimonials → CTA
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor"
 * 2. All sections render server-side — no client data fetching
 * 3. Placeholder data used for rooms/amenities until Supabase is connected
 */
import Hero from "@/components/Hero";
import About from "@/components/About";
import FeaturedRoomsSection from "@/components/sections/FeaturedRoomsSection";
import AmenitiesHighlightSection from "@/components/sections/AmenitiesHighlightSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
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
      <TestimonialsSection />
      <CTASection />
    </main>
  );
}
