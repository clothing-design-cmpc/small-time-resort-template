/**
 * FILE: app/system-vault/[vaultSlug]/otp/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate.
 *       Reachable only after the passphrase step; the "vaultSession"
 *       cookie's own otpVerified flag is what actually gates it.
 *       Also validates [vaultSlug] itself — see below.
 *
 * PURPOSE:
 * Second-factor screen: the owner enters the 12-character code emailed by
 * services/vaultOtp.js. No super_admin session cookie is required or
 * checked here — same posture as the passphrase login screen.
 *
 * [vaultSlug] IS NOT A FREE-FORM PARAMETER:
 * Same check as the parent recovery page and the login step — only
 * the ONE current value computeVaultUrlSlug() computes ever resolves
 * here. A wrong slug gets a plain 404 (notFound()), never a redirect.
 *
 * DATA FLOW:
 * 1. params.vaultSlug doesn't match computeVaultUrlSlug() -> notFound()
 * 2. Server Component redirects back to this slug's /login if no
 *    vaultSession cookie exists yet (passphrase not done), or forward
 *    to this slug's root if otpVerified is already true (nothing
 *    left to do here)
 * 3. Otherwise renders VaultOtpClient, which sends + verifies the code
 */
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "../login/VaultLogin.css";
import "./VaultOtp.css";
import { requireVaultSessionFromCookieStore, computeVaultUrlSlug } from "@/services/vaultAuth";
import VaultOtpClient from "./VaultOtpClient";

export const metadata = {
  title: "System Recovery",
  // Same deliberately generic metadata as the rest of the vault —
  // never hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function VaultOtpPage({ params }) {
  const { vaultSlug } = await params;

  const expectedSlug = await computeVaultUrlSlug();
  if (!expectedSlug || vaultSlug !== expectedSlug) {
    notFound();
  }

  const cookieStore = await cookies();
  const vaultSession = requireVaultSessionFromCookieStore(cookieStore);

  // No passphrase-verified session yet — nothing to verify a code
  // against, send them back to factor 1.
  if (!vaultSession) {
    redirect(`/system-vault/${vaultSlug}/login`);
  }

  // Already fully verified — this step is done, go straight in.
  if (vaultSession.otpVerified) {
    redirect(`/system-vault/${vaultSlug}`);
  }

  return (
    <div className="superAdminRoot">
      <section className="vaultLoginSection">
        <div className="vaultLoginCard">
          <VaultOtpClient />
        </div>
      </section>
    </div>
  );
}
