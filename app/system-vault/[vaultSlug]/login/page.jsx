/**
 * FILE: app/system-vault/[vaultSlug]/login/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate. This
 *       page is reachable by anyone who knows the hidden URL; the
 *       vault's own login chain (passphrase, then email OTP) is the
 *       only thing gating what comes after it. Also validates
 *       [vaultSlug] itself — see below.
 *
 * PURPOSE:
 * The vault's own first-factor login screen. No super_admin "session"
 * cookie is required to reach this page or submit this form — the
 * vault passphrase (VAULT_PASSPHRASE_HASH / SystemSettings.
 * vaultPassphraseHash, services/vaultAuth.js) is checked entirely on
 * its own here.
 *
 * [vaultSlug] IS NOT A FREE-FORM PARAMETER:
 * Same check as the parent recovery page — only the ONE current value
 * computeVaultUrlSlug() computes ever resolves here. A wrong slug gets
 * a plain 404 (notFound()), never a redirect, so even the LOGIN
 * screen's existence is never confirmed to someone guessing paths.
 *
 * DATA FLOW:
 * 1. params.vaultSlug doesn't match computeVaultUrlSlug() -> notFound()
 * 2. Server Component renders the shell + hands off to VaultLoginClient
 * 3. VaultLoginClient POSTs { passphrase } to /api/admin/vault-login
 * 4. On success that route sets the "vaultSession" cookie and this
 *    page redirects to this same slug's /otp step
 *
 * Wrapped in .superAdminRoot (SuperAdmin.css) so the admin font system
 * (--font-admin-heading on the h1, --font-admin-mono on the eyebrow),
 * the tightened admin spacing scale, and the design-token set that
 * scope defines actually apply — without this wrapper the CSS import
 * above has no effect and the page silently falls back to the visitor
 * site's serif heading font and looser marketing-page spacing.
 */
import { notFound } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "./VaultLogin.css";
import { computeVaultUrlSlug } from "@/services/vaultAuth";
import VaultLoginClient from "./VaultLoginClient";

export const metadata = {
  title: "System Recovery",
  // Same deliberately generic metadata as the recovery page itself —
  // never hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function VaultLoginPage({ params }) {
  const { vaultSlug } = await params;

  const expectedSlug = await computeVaultUrlSlug();
  if (!expectedSlug || vaultSlug !== expectedSlug) {
    notFound();
  }

  return (
    <div className="superAdminRoot">
      <section className="vaultLoginSection">
        <div className="vaultLoginCard">
          <VaultLoginClient />
        </div>
      </section>
    </div>
  );
}
