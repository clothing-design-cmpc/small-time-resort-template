/**
 * FILE: app/access-denied/page.jsx
 * ROLE: Public — no auth, this is the destination for a blocked request
 *
 * PURPOSE:
 * Renders AccessDeniedScreen. proxy.js redirects here (page requests
 * only — API requests still get a plain JSON 403) when the Gatekeeper
 * IP-block check blocks a request. This route itself must stay
 * reachable regardless of the block, or a blocked visitor would be
 * redirected in an infinite loop — see the exemption in proxy.js.
 */
import AccessDeniedScreen from "@/components/shared/AccessDeniedScreen";

export const metadata = {
  title: "Access Denied | Villa Azure Resort",
  description: "This request has been blocked for security reasons.",
};

export default function AccessDeniedPage() {
  return <AccessDeniedScreen />;
}
