/**
 * FILE: app/superAdmin/(protected)/settings/admin-access-limit/page.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Thin server wrapper — sets page metadata and hands off to the
 * Client Component that owns the actual form + save/edit state.
 */
import "./AdminAccessLimit.css";
import AdminAccessLimitClient from "./AdminAccessLimitClient";

export const metadata = {
  title: "Admin Access Limit | Super-Admin | your-private-resort",
};

export default function AdminAccessLimitPage() {
  return <AdminAccessLimitClient />;
}
