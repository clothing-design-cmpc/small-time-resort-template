/**
 * FILE: components/sections/TestimonialsSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Displays guest reviews in a grid.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after AmenitiesHighlightSection
 * 2. Server Component reads the singleton SystemSettings row for the
 *    section's own config (testimonialsSectionEnabled/Count/FeaturedOnly,
 *    set by the super-admin under Content > Homepage), then queries the
 *    Testimonial table using that config — same two-step pattern as the
 *    Rooms "featured" query, just config-driven instead of hardcoded
 * 3. Returns null entirely when the admin has turned the section off
 * 4. Falls back to a small set of placeholder reviews if no testimonials
 *    exist yet, so this section is never blank on a fresh install
 * 5. Eyebrow/title text also come from SystemSettings
 *    (testimonialsEyebrow/testimonialsTitle, same Homepage section
 *    header fields every other section on the page uses) — never
 *    hardcoded, with the current copy as the fallback default so the
 *    heading is never blank before an admin sets custom text.
 */
import { prisma } from "@/services/prisma";
import "./TestimonialsSection.css";

const DEFAULT_TESTIMONIALS = [
  {
    id: "t1",
    quote: "We came for a weekend and stayed for a week. The kind of quiet this place has is genuinely hard to find. Not a single thing to complain about.",
    guestName: "Marie C.",
    rating: 5,
  },
  {
    id: "t2",
    quote: "The team remembered our names on day two. The food was exceptional. The view from our villa at sunrise made everything else irrelevant.",
    guestName: "James & Toni R.",
    rating: 5,
  },
  {
    id: "t3",
    quote: "Exactly what we needed — no crowds, no noise, just water and stillness. We'll be back every year if they'll have us.",
    guestName: "Katrina M.",
    rating: 5,
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

export default async function TestimonialsSection() {
  // Read-only fetch of the singleton settings row. Fails safe to null
  // so this public page never 500s just because the row hasn't been
  // created yet — defaults below mirror the schema's own defaults.
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const isEnabled = settings?.testimonialsSectionEnabled ?? true;
  if (!isEnabled) return null;

  const count = settings?.testimonialsSectionCount ?? 3;
  const featuredOnly = settings?.testimonialsFeaturedOnly ?? true;

  // Section header copy — admin-editable under Super-Admin > Content >
  // Homepage. Falls back to the original static copy so the heading is
  // never blank on a fresh install before these fields are set.
  const eyebrowText = settings?.testimonialsEyebrow || "Guest Reviews";
  const titleText = settings?.testimonialsTitle || "What Guests Say";

  const testimonials = await prisma.testimonial
    .findMany({
      where: featuredOnly ? { isFeatured: true } : {},
      orderBy: { displayOrder: "asc" },
      take: count,
    })
    .catch(() => []);

  const displayTestimonials = testimonials.length > 0 ? testimonials : DEFAULT_TESTIMONIALS;

  return (
    <section className="testimonialsSection" id="testimonials">
      <div className="testimonialsContainer">
        <div className="testimonialsHeader">
          <span className="testimonialsEyebrow">{eyebrowText}</span>
          <h2 className="testimonialsTitle">{titleText}</h2>
        </div>

        <div className="testimonialsGrid">
          {displayTestimonials.map((t) => (
            <article key={t.id} className="testimonialCard">
              <StarRating count={t.rating} />
              <blockquote className="testimonialQuote">&ldquo;{t.quote}&rdquo;</blockquote>
              <footer className="testimonialMeta">
                <span className="testimonialName">{t.guestName}</span>
              </footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}