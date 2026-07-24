/**
 * FILE: app/visitor/directions/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * "How to Get There" — thin Server Component shell around
 * DirectionsClient (villa-azure-ai-insight-and-directions-plan.txt,
 * Part 2). All interactivity (geolocation, reference code verification,
 * gated directions widget) lives in the Client Component below, per
 * Rule 31.1 — this file only renders the static intro copy and
 * metadata.
 */
import "./Directions.css";
import DirectionsClient from "./DirectionsClient";

export const metadata = {
  title: "How to Get There | Villa Azure Resort",
  description: "Get turn-by-turn directions to Villa Azure Resort using your booking reference code.",
};

export default function DirectionsPage() {
  return (
    <main className="directionsPage">
      <section className="directionsHero">
        <span className="directionsEyebrow">FOR CONFIRMED GUESTS</span>
        <h1 className="directionsTitle">How to Get There</h1>
        <p className="directionsSubtitle">
          Enter the reference code from your booking invoice to unlock turn-by-turn directions
          to Villa Azure Resort from your current location.
        </p>
        <div className="directionsContainer">
          <DirectionsClient />
        </div>
      </section>
    </main>
  );
}
