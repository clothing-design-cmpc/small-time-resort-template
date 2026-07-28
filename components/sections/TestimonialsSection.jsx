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
 * 3. Returns null entirely when the admin has turned the section off,
 *    OR when there are zero testimonials in the database — no
 *    placeholder/sample reviews are ever shown, so what a visitor sees
 *    always matches exactly what's in Super-Admin > Testimonials.
 * 4. Eyebrow/title text come from SystemSettings
 *    (testimonialsEyebrow/testimonialsTitle, same Homepage section
 *    header fields every other section on the page uses) — never
 *    hardcoded, with the current copy as the fallback default so the
 *    heading is never blank before an admin sets custom text.
 */
import { prisma } from "@/services/prisma";
import Image from "next/image";
import "./TestimonialsSection.css";

/**
 * getInitials
 * Falls back to the guest's initials (e.g. "Marie C." -> "MC") when no
 * guestPhoto was uploaded, so every testimonial card has a consistent
 * avatar treatment instead of a blank gap where a photo would go.
 */
function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

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

  // No placeholder fallback — if there are no real testimonials yet,
  // hide the section entirely rather than showing sample/fake reviews
  // that don't exist in the database.
  if (testimonials.length === 0) return null;

  return (
    <section className="testimonialsSection" id="testimonials">
      <div className="testimonialsContainer">
        <div className="testimonialsHeader">
          <span className="testimonialsEyebrow">{eyebrowText}</span>
          <h2 className="testimonialsTitle">{titleText}</h2>
        </div>

        <div className="testimonialsGrid">
          {testimonials.map((t) => (
            <article key={t.id} className="testimonialCard">
              <div className="testimonialAvatarRow">
                {/* Guest photo — uploaded via Super-Admin > Testimonials, stored
                    in Cloudflare R2. Falls back to an initials avatar when no
                    photo was uploaded, so every card looks intentional. */}
                {t.guestPhoto ? (
                  <Image
                    src={t.guestPhoto}
                    alt={t.guestName}
                    width={48}
                    height={48}
                    className="testimonialAvatarPhoto"
                  />
                ) : (
                  <div className="testimonialAvatarInitials" aria-hidden="true">
                    {getInitials(t.guestName)}
                  </div>
                )}
                <div className="testimonialAvatarMeta">
                  <span className="testimonialName">{t.guestName}</span>
                  <StarRating count={t.rating} />
                </div>
              </div>
              <blockquote className="testimonialQuote">&ldquo;{t.quote}&rdquo;</blockquote>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}