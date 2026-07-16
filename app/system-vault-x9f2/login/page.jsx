/**
 * FILE: app/system-vault-x9f2/login/page.jsx
 * ROLE: Super-admin only — protected by proxy.js (HIDDEN_RECOVERY_PATH
 *       matches on startsWith, so /system-vault-x9f2/login is covered
 *       the same as /system-vault-x9f2 itself)
 *
 * PURPOSE:
 * The vault's own second-factor login screen. Reaching this page at
 * all already required a valid super_admin "session" cookie (proxy.js
 * enforces that), but that alone only gets you as far as this form —
 * the separate vault passphrase (VAULT_PASSPHRASE_HASH,
 * services/vaultAuth.js) still has to be entered here before
 * /system-vault-x9f2 will render anything.
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
