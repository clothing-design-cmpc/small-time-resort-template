/**
 * FILE: app/superAdmin/(protected)/content/activities/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Activities Management (blueprint Page 4). Lists every activity with
 * duration, group size, featured/active state. "Add Activity" links to
 * the create form.
 *
 * DATA FLOW:
 * 1. ActivitiesListClient (Client Component) owns the actual data
 *    fetching via useActivities() since the list needs live delete/
 *    refetch behavior
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Activities.css";
import ActivitiesListClient from "./ActivitiesListClient";

export const metadata = {
  title: "Activities | Super-Admin | your-private-resort",
};

export default function ActivitiesManagementPage() {
  return <ActivitiesListClient />;
}
