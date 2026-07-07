/**
 * FILE: components/About.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Second section on the visitor homepage. Tells the resort's story in a
 * short, scannable way and lists three differentiators ("why choose us").
 * Fully static content for now — copy is a placeholder until real resort
 * history/photography is supplied.
 *
 * DATA FLOW:
 * 1. Rendered as the second child inside app/visitor/page.jsx, directly
 *    after <Hero />
 * 2. No data fetching — fully static content
 * 3. Anchors to "#about" so the Hero's future nav / footer links can jump here
 */
import "./About.css";

const differentiators = [
  {
    id: "diff-privacy",
    title: "True Privacy",
    description:
      "A handful of villas, never a crowd. Every stay is designed around distance from everything else.",
  },
  {
    id: "diff-setting",
    title: "A Quiet Shoreline",
    description:
      "No boardwalks, no beach vendors — just open water and the sound of it.",
  },
  {
    id: "diff-care",
    title: "Personal Attention",
    description:
      "A small, attentive team who knows every guest by name, not by room number.",
  },
];

export default function About() {
  return (
    <section className="aboutSection" id="about">
      <div className="aboutContainer">
        <span className="aboutEyebrow">Our Story</span>
        <h2 className="aboutTitle">A Retreat, Not a Resort</h2>
        <p className="aboutBody">
          Villa Azure Resort began as a single villa on an otherwise untouched
          shoreline. What started as one family&apos;s private escape has grown,
          slowly and deliberately, into a handful of villas — never more than
          the land and the quiet can hold. We built it for people who want
          distance from everything else, not another itinerary to keep.
        </p>

        <div className="aboutDifferentiators">
          {differentiators.map((item) => (
            <article className="aboutDifferentiatorCard" key={item.id}>
              <h3 className="aboutDifferentiatorTitle">{item.title}</h3>
              <p className="aboutDifferentiatorBody">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
