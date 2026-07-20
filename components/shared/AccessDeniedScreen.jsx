/**
 * FILE: components/shared/AccessDeniedScreen.jsx
 * ROLE: Public — no auth required to view, this IS the denial screen
 *
 * PURPOSE:
 * Full-page notice shown when proxy.js's Gatekeeper IP-block check
 * (3-Gatekeeper breach response) blocks a request. Replaces the old
 * bare `new NextResponse("Access denied.", { status: 403 })` plain-text
 * response with a real page, matching MaintenanceLockdownScreen's
 * design language so a blocked visitor/admin isn't staring at raw text.
 *
 * Deliberately vague on WHY — never states which gatekeeper tripped,
 * never gives a hint that could help someone probe the block logic
 * (same "no further detail" principle proxy.js already documents for
 * the block itself).
 *
 * Plain Server Component — no interactivity needed, just a static notice.
 */
import "./AccessDeniedScreen.css";

export default function AccessDeniedScreen() {
  return (
    <div className="accessDeniedScreen" role="alert">
      <div className="accessDeniedCard">
        <span className="accessDeniedIcon" aria-hidden="true">⛔</span>
        <h1>Access Denied</h1>
        <p>
          This request has been blocked for security reasons. If you believe this is a mistake,
          please contact the site owner.
        </p>
      </div>
    </div>
  );
}
