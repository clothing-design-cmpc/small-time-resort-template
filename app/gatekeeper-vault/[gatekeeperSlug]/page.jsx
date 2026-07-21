/**
 * FILE: app/gatekeeper-vault/[gatekeeperSlug]/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate, NOT
 *       part of the app/superAdmin route group, and NOT linked from
 *       the Sidebar, AdminHeader, or anywhere else in the app. Gated
 *       entirely by its own login chain plus the [gatekeeperSlug] check
 *       below. Replaces the old, nav-linked
 *       app/superAdmin/(protected)/gatekeeper-tester page.
 *
 * PURPOSE:
 * Hosts the Gatekeeper Tester (dry-runs Gatekeeper 1/2 breach
 * detectors against this deployment) behind its own hidden URL and its
 * own passphrase — completely separate secret from the disaster-
 * recovery vault at app/system-vault/[vaultSlug]/.
 *
 * [gatekeeperSlug] IS NOT A FREE-FORM PARAMETER:
 * Only ONE value ever resolves to anything — whatever
 * computeGatekeeperVaultUrlSlug() (services/gatekeeperVaultAuth.js)
 * currently computes from the live passphrase hash. Any other value
 * hits notFound() and gets a plain 404, identical to a route that was
 * never built.
 *
 * DATA FLOW:
 * 1. params.gatekeeperSlug doesn't match computeGatekeeperVaultUrlSlug() -> notFound()
 * 2. No gatekeeperVaultSession cookie -> redirect to this slug's /login
 * 3. Valid session -> render GatekeeperVaultClient (the dry-run UI)
 */
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "./GatekeeperVault.css";
import {
  requireGatekeeperVaultSessionFromCookieStore,
  computeGatekeeperVaultUrlSlug,
} from "@/services/gatekeeperVaultAuth";
import GatekeeperVaultClient from "./GatekeeperVaultClient";

export const metadata = {
  title: "System Recovery",
  // Same deliberately generic metadata as the login screen — never
  // hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function GatekeeperVaultPage({ params }) {
  const { gatekeeperSlug } = await params;

  const expectedSlug = await computeGatekeeperVaultUrlSlug();
  if (!expectedSlug || gatekeeperSlug !== expectedSlug) {
    notFound();
  }

  const cookieStore = await cookies();
  const session = requireGatekeeperVaultSessionFromCookieStore(cookieStore);

  if (!session) {
    redirect(`/gatekeeper-vault/${gatekeeperSlug}/login`);
  }

  return (
    <div className="superAdminRoot">
      <GatekeeperVaultClient />
    </div>
  );
}
