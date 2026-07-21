/**
 * FILE: components/About.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Second section on the visitor homepage. Tells the resort's story and
 * lists three differentiators ("why choose us").
 *
 * DATA FLOW:
 * 1. Rendered as the second child inside app/visitor/page.jsx, directly
 *    after <Hero />
 * 2. Server Component reads the singleton SystemSettings row directly
 *    via Prisma (same pattern app/visitor/policies/page.jsx already
 *    uses) — aboutPageContent is editable by the super-admin under
 *    Content > Homepage / Policies
 * 3. Falls back to the original placeholder story copy if the admin
 *    hasn't filled it in yet, so this section is never blank
 * 4. The three differentiator cards stay static — there is no schema
 *    field for them yet, so nothing to wire there
 * 5. Anchors to "#about" so the Hero's nav / footer links can jump here
 */
import { prisma } from "@/services/prisma";
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

const DEFAULT_ABOUT_BODY =
  "Villa Azure Resort began as a single villa on an otherwise untouched " +
  "shoreline. What started as one family's private escape has grown, " +
  "slowly and deliberately, into a handful of villas — never more than " +
  "the land and the quiet can hold. We built it for people who want " +
  "distance from everything else, not another itinerary to keep.";

export default async function About() {
  // Read-only fetch of the singleton settings row the super-admin edits.
  // Fails safe to null so this public page never 500s just because the
  // row hasn't been created yet.
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const aboutBody = settings?.aboutPageContent?.trim() || DEFAULT_ABOUT_BODY;

  return (
    <section className="aboutSection" id="about">
      <div className="aboutContainer">
        <span className="aboutEyebrow">Our Story</span>
        <h2 className="aboutTitle">A Retreat, Not a Resort</h2>
        <p className="aboutBody">{aboutBody}</p>

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
