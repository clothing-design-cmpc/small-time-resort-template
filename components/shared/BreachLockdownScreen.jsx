/**
 * FILE: components/shared/BreachLockdownScreen.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Replaces the ENTIRE visitor site — no Header, no Footer, no page
 * content underneath — with a single full-page notice the moment
 * SystemSettings.breachLockdown is true. This is deliberately more
 * severe than MaintenanceBanner (which just sits above a still-working
 * site): a breach means the database itself may be compromised, so
 * nothing else on the visitor side should render at all until a
 * super-admin has restored from backup and ended the lockdown via the
 * hidden recovery page.
 *
 * Plain Server Component — no interactivity needed, just a static notice.
 */
import "./BreachLockdownScreen.css";

export default function BreachLockdownScreen({ message }) {
  return (
    <div className="breachLockdownScreen" role="alert">
      <div className="breachLockdownCard">
        <span className="breachLockdownIcon" aria-hidden="true">⚠</span>
        <h1>We'll Be Right Back</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}
