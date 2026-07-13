/**
 * FILE: app/visitor/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * The resort homepage. Currently renders Hero and About only.
 * FeaturedRoomsSection, CTASection (date carousel), BookedDatesSection,
 * AmenitiesHighlightSection, TestimonialsSection, and MiniStoreSection
 * all exist as files but are intentionally NOT wired in yet — they
 * depend on a Room model + rooms API that hasn't been built. Add them
 * here one at a time once that backend work lands.
 *
 * DATA FLOW:
 * 1. Visitor lands on "/" → app/page.jsx redirects to "/visitor"
 * 2. This Server Component renders inside app/visitor/layout.jsx
 * 3. Hero and About are fully static — no data fetching on this page yet
 */
import Hero from "@/components/Hero";
import About from "@/components/About";

export const metadata = {
  title: "Villa Azure Resort",
  description:
    "Intimate villas, quiet shores, and a stillness that only comes with distance from everything else.",
  openGraph: {
    title: "Villa Azure Resort",
    description:
      "Intimate villas, quiet shores, and a stillness that only comes with distance from everything else.",
  },
};

export default function VisitorHomePage() {
  return (
    <>
      <Hero />
      <About />
    </>
  );
}
