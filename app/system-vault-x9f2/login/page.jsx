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
    <section className="vaultLoginSection">
      <div className="vaultLoginCard">
        <VaultLoginClient />
      </div>
    </section>
  );
}
