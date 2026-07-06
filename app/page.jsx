/**
 * FILE: app/page.jsx
 * ROLE: Public entry point — no auth required
 *
 * PURPOSE:
 * Root route "/" never renders content directly. It redirects visitors
 * to the public visitor site. Once superAdmin login exists, this will
 * also check for an active superAdmin session and redirect accordingly.
 *
 * DATA FLOW:
 * 1. User hits "/"
 * 2. No session check exists yet (superAdmin not built) — always redirect to /visitor
 * 3. Future: check session cookie -> redirect superAdmin to /superAdmin, others to /visitor
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  // No auth system built yet — every visitor lands on the public site
  redirect("/visitor");
}
