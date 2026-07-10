/**
 * FILE: app/license-invalid/page.jsx
 * ROLE: Public — reachable by anyone, but only shown when middleware.js
 *       redirects here after services/licenseGuard.js reports an invalid license
 *
 * PURPOSE:
 * Renders a plain, non-technical notice when this deployment's license
 * key is missing, revoked, or being used on a domain it wasn't issued
 * for. Never shows technical details (no key values, no reasons) since
 * this page is publicly reachable by whoever visits the site.
 *
 * DATA FLOW:
 * 1. middleware.js calls checkLicense(hostname) on every request
 * 2. If invalid -> redirected here before any other page can render
 * 3. This page shows a static message only — it makes no further checks
 */
import "./license-invalid.css";

export const metadata = {
  title: "Site Unavailable",
  description: "This site is temporarily unavailable.",
};

export default function LicenseInvalidPage() {
  return (
    <section className="licenseInvalidSection">
      <div className="licenseInvalidCard">
        <p className="licenseInvalidEyebrow">Notice</p>
        <h1 className="licenseInvalidTitle">This site is temporarily unavailable.</h1>
        <p className="licenseInvalidBody">
          Please contact the site owner for assistance.
        </p>
      </div>
    </section>
  );
}
