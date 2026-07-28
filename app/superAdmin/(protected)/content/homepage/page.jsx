/**
 * FILE: app/superAdmin/(protected)/content/homepage/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Homepage Customization (blueprint Page 9). Lets the admin edit the
 * hero section, pick the 3 featured rooms, configure the testimonials
 * and CTA sections, and set SEO/social metadata for the homepage.
 *
 * DATA FLOW:
 * 1. HomepageSettingsClient (Client Component) owns the actual data
 *    fetching via useHomepageSettings() and useRooms() since the form
 *    needs live save/refetch behavior and the room picklist
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Homepage.css";
import HomepageSettingsClient from "./HomepageSettingsClient";

export const metadata = {
  title: "Homepage | Super-Admin | your-private-resort",
};

export default function HomepageCustomizationPage() {
  return <HomepageSettingsClient />;
}
