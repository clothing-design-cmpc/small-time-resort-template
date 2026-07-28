/**
 * FILE: app/visitor/page.jsx
 * ROLE: Visitor — public landing page
 *
 * PURPOSE:
 * Homepage that renders all visitor sections in sequence:
 * Hero → About → Featured Rooms → Amenities → Mini Store →
 * Testimonials → Activities → Gallery Preview → How to Book →
 * Booked Dates
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor"
 * 2. Hero, About, AmenitiesHighlightSection, TestimonialsSection,
 *    ActivitiesHighlightSection, and GalleryPreviewSection are all
 *    Server Components that read their data directly via Prisma —
 *    same pattern app/visitor/policies/page.jsx uses. MiniStoreSection
 *    is a Client Component that fetches from /api/shop.
 * 3. BookedDatesSection is a Client Component — it owns interactive
 *    calendar state locally, no SSR data needed
 */
import Hero from "@/components/Hero";
import About from "@/components/About";
import FeaturedRoomsSection from "@/components/sections/FeaturedRoomsSection";
import AmenitiesHighlightSection from "@/components/sections/AmenitiesHighlightSection";
import MiniStoreSection from "@/components/sections/MiniStoreSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import ActivitiesHighlightSection from "@/components/sections/ActivitiesHighlightSection";
import GalleryPreviewSection from "@/components/sections/GalleryPreviewSection";
import HowToBookSection from "@/components/sections/HowToBookSection";
import BookedDatesSection from "@/components/sections/BookedDatesSection";

export const metadata = {
  title: "your-private-resort | Home",
  description: "A private resort offering an intimate escape — one room, thoughtful care, and the quiet of the countryside.",
  openGraph: {
    title: "your-private-resort",
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
      <ActivitiesHighlightSection />
      <GalleryPreviewSection />
      <HowToBookSection />
      <BookedDatesSection />
    </main>
  );
}