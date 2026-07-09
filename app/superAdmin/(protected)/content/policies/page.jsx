/**
 * FILE: app/superAdmin/(protected)/content/policies/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Policies & Content Pages (blueprint Page 8). Lets the admin edit all
 * text content that appears on the visitor site: House Rules,
 * Cancellation Policy, Terms & Conditions, Privacy Policy, About Page,
 * and Contact Information.
 *
 * DATA FLOW:
 * 1. PoliciesClient (Client Component) owns the actual data fetching
 *    via usePolicies() since the form needs live save/refetch behavior
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Policies.css";
import PoliciesClient from "./PoliciesClient";

export const metadata = {
  title: "Policies | Super-Admin | Villa Azure Resort",
};

export default function PoliciesManagementPage() {
  return <PoliciesClient />;
}
