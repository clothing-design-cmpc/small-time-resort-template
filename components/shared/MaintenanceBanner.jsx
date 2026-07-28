/**
 * FILE: components/shared/MaintenanceBanner.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Renders a full-width, impossible-to-miss banner at the very top of
 * every /visitor page when SystemSettings.maintenanceMode is true.
 * Used for the Task 4 breach-response flow: the moment a gatekeeper
 * detects an intrusion attempt, the super-admin flips this on from the
 * Dashboard and every guest sees this notice instead of a silent site.
 *
 * This is a plain Server Component (no "use client") — it only reads
 * props already fetched by the layout, no interactivity needed here.
 */
import "./MaintenanceBanner.css";

export default function MaintenanceBanner({ message }) {
  return (
    <div className="maintenanceBanner" role="alert">
      <span className="maintenanceBannerIcon" aria-hidden="true">⚠</span>
      <div className="maintenanceBannerText">
        <strong>your-private-resort is currently under maintenance.</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}
