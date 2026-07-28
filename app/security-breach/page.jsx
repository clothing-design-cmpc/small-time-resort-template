/**
 * FILE: app/security-breach/page.jsx
 * ROLE: Public — shown to guests when the system is locked down due to a
 * detected security breach (triggered from System Recovery vault).
 *
 * PURPOSE:
 * Displays a clear, non-technical notice that the site is temporarily
 * unavailable because of a security incident. Mirrors the existing
 * /maintenance page pattern but with breach-specific messaging and an
 * amber/red tone instead of the neutral maintenance tone.
 *
 * DATA FLOW:
 * 1. Middleware or the System Recovery vault sets an active lockdown flag.
 * 2. All public routes redirect here while lockdown is active.
 * 3. Page is static — no data fetching required.
 */

export const metadata = {
  title: "Security Notice | your-private-resort",
  description: "This site is temporarily unavailable due to a security incident.",
};

export default function SecurityBreachPage() {
  return (
    <section className="securityBreachSection">
      <div className="securityBreachCard">
        <span className="securityBreachIcon" aria-hidden="true">⚠</span>
        <h1 className="securityBreachTitle">Site Temporarily Unavailable</h1>
        <p className="securityBreachBody">
          We detected unusual activity and locked the system down as a
          precaution while our team investigates. No action is needed on
          your end — please check back shortly.
        </p>
      </div>
    </section>
  );
}