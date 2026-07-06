/**
 * FILE: app/visitor/page.jsx
 * ROLE: Visitor — public landing page
 *
 * PURPOSE:
 * Default entry point for the visitor site ("/visitor"). This is a
 * placeholder shell — the Hero, About, Rooms & Villas, Amenities,
 * Resort Shop, Activities, Gallery, Testimonials, Location, and
 * Contact sections will each be added as their own components
 * per the resort visitor master template plan, one at a time.
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor"
 * 2. This Server Component renders the placeholder shell below
 * 3. Future sections will be imported and rendered here in order
 */
export const metadata = {
  title: "Villa Azure Resort | Home",
  description: "A private resort offering an intimate escape.",
};

export default function VisitorHomePage() {
  return (
    <main>
      <section className="visitorPlaceholder">
        <div className="visitorPlaceholderContainer">
          <span className="visitorPlaceholderEyebrow">Villa Azure Resort</span>
          <h1 className="visitorPlaceholderTitle">Visitor site under construction</h1>
          <p className="visitorPlaceholderBody">
            Sections will be added one at a time: Hero, About, Rooms &amp; Villas,
            Amenities, Resort Shop, Activities, Gallery, Testimonials, Location, and Contact.
          </p>
        </div>
      </section>
    </main>
  );
}
