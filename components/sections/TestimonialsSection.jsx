/**
 * FILE: components/sections/TestimonialsSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Displays 3 guest reviews in a grid. Static placeholder content until
 * a reviews DB table is added. Simple quote + name + date layout.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after AmenitiesHighlightSection
 * 2. No data fetching — static placeholder testimonials
 */
import "./TestimonialsSection.css";

const testimonials = [
  {
    id: "t1",
    quote: "We came for a weekend and stayed for a week. The kind of quiet this place has is genuinely hard to find. Not a single thing to complain about.",
    name: "Marie C.",
    date: "June 2026",
    stars: 5,
  },
  {
    id: "t2",
    quote: "The team remembered our names on day two. The food was exceptional. The view from our villa at sunrise made everything else irrelevant.",
    name: "James & Toni R.",
    date: "April 2026",
    stars: 5,
  },
  {
    id: "t3",
    quote: "Exactly what we needed — no crowds, no noise, just water and stillness. We'll be back every year if they'll have us.",
    name: "Katrina M.",
    date: "March 2026",
    stars: 5,
  },
];

/* Renders 5 star characters, filled or muted */
function StarRating({ count }) {
  return (
    <div className="testimonialStars" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < count ? "starFilled" : "starEmpty"}>★</span>
      ))}
    </div>
  );
}

export default function TestimonialsSection() {
  return (
    <section className="testimonialsSection" id="testimonials">
      <div className="testimonialsContainer">
        <div className="testimonialsHeader">
          <span className="testimonialsEyebrow">Guest Reviews</span>
          <h2 className="testimonialsTitle">What Guests Say</h2>
        </div>

        <div className="testimonialsGrid">
          {testimonials.map((t) => (
            <article key={t.id} className="testimonialCard">
              <StarRating count={t.stars} />
              <blockquote className="testimonialQuote">&ldquo;{t.quote}&rdquo;</blockquote>
              <footer className="testimonialMeta">
                <span className="testimonialName">{t.name}</span>
                <span className="testimonialDate">{t.date}</span>
              </footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}