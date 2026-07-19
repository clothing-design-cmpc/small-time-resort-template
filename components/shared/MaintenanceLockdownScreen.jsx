/**
 * FILE: components/shared/MaintenanceLockdownScreen.jsx
 * ROLE: Visitor + Super-admin — public, no auth required to view
 *
 * PURPOSE:
 * Replaces the ENTIRE site — visitor pages AND every super-admin page —
 * with a single full-page notice the moment SystemSettings.
 * postWipeLockdown is true (scripts/runDatabaseWipe.js flips this on
 * the instant a scheduled wipe's TRUNCATE actually succeeds).
 *
 * Deliberately its own component, separate from BreachLockdownScreen:
 * a breach lockdown still lets the logged-in super-admin reach every
 * /superAdmin page (only the public visitor site goes dark) so they
 * can review the incident and drive recovery from familiar admin UI.
 * A post-wipe lockdown is stricter — account_activity_logs itself was
 * just truncated, so continuing to browse the super-admin dashboard as
 * if nothing happened isn't safe. Both visitor AND super-admin are
 * fully blocked here (see proxy.js), and this screen is the only thing
 * either surface renders until the hidden vault recovery page lifts it
 * (app/api/admin/post-wipe-lockdown).
 *
 * Plain Server Component — no interactivity needed, just a static notice.
 */
import "./MaintenanceLockdownScreen.css";

export default function MaintenanceLockdownScreen({ message }) {
  return (
    <div className="maintenanceLockdownScreen" role="alert">
      <div className="maintenanceLockdownCard">
        <span className="maintenanceLockdownIcon" aria-hidden="true">🛠</span>
        <h1>Website Under Maintenance</h1>
        <p>
          {message ||
            "This website's database was just wiped as scheduled and is currently under maintenance. Sorry for the inconvenience — please check back shortly."}
        </p>
      </div>
    </div>
  );
}
