/**
 * FILE: app/system-vault-x9f2/otp/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate.
 *       Reachable only after the passphrase step; the "vaultSession"
 *       cookie's own otpVerified flag is what actually gates it.
 *
 * PURPOSE:
 * Second-factor screen: the owner enters the 6-digit code emailed by
 * services/vaultOtp.js. No super_admin session cookie is required or
 * checked here — same posture as the passphrase login screen.
 *
 * DATA FLOW:
 * 1. Server Component redirects back to /system-vault-x9f2/login if no
 *    vaultSession cookie exists yet (passphrase not done), or forward
 *    to /system-vault-x9f2 if otpVerified is already true (nothing
 *    left to do here)
 * 2. Otherwise renders VaultOtpClient, which sends + verifies the code
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "../login/VaultLogin.css";
import "./VaultOtp.css";
import { requireVaultSessionFromCookieStore } from "@/services/vaultAuth";
import VaultOtpClient from "./VaultOtpClient";

export const metadata = {
  title: "System Recovery",
  // Same deliberately generic metadata as the rest of the vault —
  // never hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function VaultOtpPage() {
  const cookieStore = await cookies();
  const vaultSession = requireVaultSessionFromCookieStore(cookieStore);

  // No passphrase-verified session yet — nothing to verify a code
  // against, send them back to factor 1.
  if (!vaultSession) {
    redirect("/system-vault-x9f2/login");
  }

  // Already fully verified — this step is done, go straight in.
  if (vaultSession.otpVerified) {
    redirect("/system-vault-x9f2");
  }

  return (
    <section className="vaultLoginSection">
      <div className="vaultLoginCard">
        <VaultOtpClient />
      </div>
    </section>
  );
}
