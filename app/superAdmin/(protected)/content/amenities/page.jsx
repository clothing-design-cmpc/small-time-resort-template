/**
 * FILE: app/superAdmin/(protected)/content/amenities/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Amenities Management (blueprint Page 2). Lists every amenity with
 * its icon and active state, and lets the admin create, edit, or
 * delete amenities via a modal form.
 *
 * DATA FLOW:
 * 1. AmenitiesListClient (Client Component) owns the actual data
 *    fetching via useAmenities() since the list needs live
 *    create/edit/delete/refetch behavior
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Amenities.css";
import AmenitiesListClient from "./AmenitiesListClient";

export const metadata = {
  title: "Amenities | Super-Admin | your-private-resort",
};

export default function AmenitiesManagementPage() {
  return <AmenitiesListClient />;
}
