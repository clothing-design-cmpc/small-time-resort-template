/**
 * FILE: app/visitor/page.jsx
 * ROLE: Visitor — public landing page
 *
 * PURPOSE:
 * Default entry point for the visitor site ("/visitor"). Renders Hero
 * then About. Remaining sections (Rooms & Villas, Amenities, Resort
 * Shop, Activities, Gallery, Testimonials, Location, Contact, Footer)
 * will each be added as their own components per the resort visitor
 * master template plan, one at a time.
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor"
 * 2. This Server Component renders <Hero /> then <About />, and future
 *    sections in order
 * 3. No data fetching happens here yet — all sections are static for now
 */
import Hero from "@/components/Hero";
import About from "@/components/About";

export const metadata = {
  title: "Villa Azure Resort | Home",
  description: "A private resort offering an intimate escape.",
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
    </main>
  );
}