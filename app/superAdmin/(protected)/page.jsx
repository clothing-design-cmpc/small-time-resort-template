/**
 * FILE: app/superAdmin/(protected)/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Root of the /superAdmin route never renders content directly.
 * It redirects into /superAdmin/dashboard, the account's default view.
 *
 * DATA FLOW:
 * 1. Middleware already confirmed a valid superAdmin session before
 *    this page is reached
 * 2. Always redirect straight to /superAdmin/dashboard
 */
import { redirect } from "next/navigation";

export default function SuperAdminRootPage() {
  redirect("/superAdmin/dashboard");
}
