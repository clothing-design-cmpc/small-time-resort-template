/**
 * FILE: app/gatekeeper-vault/[gatekeeperSlug]/login/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate. Also
 *       validates [gatekeeperSlug] itself — see below.
 *
 * PURPOSE:
 * The Gatekeeper Vault's own login screen. No super_admin "session"
 * cookie is required to reach this page or submit this form — the
 * passphrase (GATEKEEPER_VAULT_PASSPHRASE_HASH /
 * GatekeeperVaultPassphrase.passphraseHash, services/gatekeeperVaultAuth.js)
 * is checked entirely on its own here.
 *
 * [gatekeeperSlug] IS NOT A FREE-FORM PARAMETER:
 * Only the ONE current value computeGatekeeperVaultUrlSlug() computes
 * ever resolves here. A wrong slug gets a plain 404 (notFound()),
 * never a redirect, so even this screen's existence is never confirmed
 * to someone guessing paths.
 *
 * DATA FLOW:
 * 1. params.gatekeeperSlug doesn't match computeGatekeeperVaultUrlSlug() -> notFound()
 * 2. Server Component renders the shell + hands off to
 *    GatekeeperVaultLoginClient
 * 3. Client POSTs { passphrase } to /api/gatekeeper-vault/login
 * 4. On success that route sets the "gatekeeperVaultSession" cookie and
 *    this page redirects back to this same slug's root
 */
import { notFound } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "./GatekeeperVaultLogin.css";
import { computeGatekeeperVaultUrlSlug } from "@/services/gatekeeperVaultAuth";
import GatekeeperVaultLoginClient from "./GatekeeperVaultLoginClient";

export const metadata = {
  title: "System Recovery",
  // Deliberately generic — never hint at what this gates to anyone who
  // stumbles onto the URL.
  description: "Restricted access.",
};

export default async function GatekeeperVaultLoginPage({ params }) {
  const { gatekeeperSlug } = await params;

  const expectedSlug = await computeGatekeeperVaultUrlSlug();
  if (!expectedSlug || gatekeeperSlug !== expectedSlug) {
    notFound();
  }

  return (
    <div className="superAdminRoot">
      <section className="gatekeeperVaultLoginSection">
        <div className="gatekeeperVaultLoginCard">
          <GatekeeperVaultLoginClient />
        </div>
      </section>
    </div>
  );
}
