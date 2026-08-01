/**
 * FILE: components/shared/MaintenanceLoginLink.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * While maintenanceMode is on, app/visitor/layout.jsx wraps the entire
 * Header (and everything else a guest could interact with) in `inert`
 * (see Header.jsx's maintenanceMode prop) — so its own Login link is
 * unclickable by design. `inert` cannot be selectively lifted for one
 * descendant, so this component renders a second, real Login link as a
 * sibling OUTSIDE that inert tree, fixed-positioned over the same top
 * right spot the Header's Login link normally occupies. This is the
 * ONLY interactive element on the visitor site while maintenance mode
 * is active — staff/admins can still sign in; guests can't click,
 * tap, or tab into anything else.
 *
 * DATA FLOW:
 * 1. app/visitor/layout.jsx renders this as a sibling of the inert
 *    wrapper only when SystemSettings.maintenanceMode is true
 * 2. Position is anchored below the fixed maintenance banner strip via
 *    --maintenance-banner-height (already published by
 *    MaintenanceBanner.jsx), so it never overlaps the notice text
 */
import Link from "next/link";
import "./MaintenanceLoginLink.css";

export default function MaintenanceLoginLink() {
  return (
    <Link href="/superAdmin/login" className="maintenanceLoginLink">
      Login
    </Link>
  );
}
