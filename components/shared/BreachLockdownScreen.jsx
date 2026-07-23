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
 * GATEKEEPER-SPECIFIC CONTENT:
 * Gatekeeper 2 (SQL injection attempt) gets its own title/body instead
 * of the shared generic maintenance wording — an injection attempt is a
 * distinct kind of incident from a login brute force or an anomalous
 * admin sign-in, so the notice says so explicitly. Gatekeepers 1 and 3,
 * and any lockdown with no known gatekeeper (e.g. one triggered by hand
 * from the vault), keep the original generic message.
 *
 * Plain Server Component — no interactivity needed, just a static notice.
 */
import "./BreachLockdownScreen.css";

export default function BreachLockdownScreen({ message, gatekeeper }) {
  const isGatekeeper2 = gatekeeper === 2;

  return (
    <div className="breachLockdownScreen" role="alert">
      <div className="breachLockdownCard">
        <span className="breachLockdownIcon" aria-hidden="true">⚠</span>
        {isGatekeeper2 ? (
          <>
            <h1>Security Incident Detected</h1>
            <p>
              We detected and blocked a malicious attempt to tamper with our
              booking system. As a precaution, the site is temporarily
              offline while our team reviews the incident. No guest data was
              exposed. Please check back shortly.
            </p>
          </>
        ) : (
          <>
            <h1>Website Under Maintenance</h1>
            <p>{message}</p>
          </>
        )}
      </div>
    </div>
  );
}
