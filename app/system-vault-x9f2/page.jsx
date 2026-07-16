/**
 * FILE: app/system-vault-x9f2/login/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate. This
 *       page is reachable by anyone who knows the hidden URL; the
 *       vault's own login chain (passphrase, then email OTP) is the
 *       only thing gating what comes after it.
 *
 * PURPOSE:
 * The vault's own first-factor login screen. No super_admin "session"
 * cookie is required to reach this page or submit this form — the
 * vault passphrase (VAULT_PASSPHRASE_HASH, services/vaultAuth.js) is
 * checked entirely on its own here.
 *
 * DATA FLOW:
 * 1. Server Component renders the shell + hands off to VaultLoginClient
 * 2. VaultLoginClient POSTs { passphrase } to /api/admin/vault-login
 * 3. On success that route sets the "vaultSession" cookie and this
 *    page redirects to /system-vault-x9f2, which now renders normally
 *
 * Wrapped in .superAdminRoot (SuperAdmin.css) so the admin font system
 * (--font-admin-heading on the h1, --font-admin-mono on the eyebrow),
 * the tightened admin spacing scale, and the design-token set that
 * scope defines actually apply — without this wrapper the CSS import
 * above has no effect and the page silently falls back to the visitor
 * site's serif heading font and looser marketing-page spacing.
 */
import "@/app/superAdmin/SuperAdmin.css";
import "./VaultLogin.css";
import VaultLoginClient from "./VaultLoginClient";

export const metadata = {
  title: "System Recovery",
  // Same deliberately generic metadata as the recovery page itself —
  // never hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default function VaultLoginPage() {
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
