/**
 * FILE: app/system-vault-x9f2/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate. The
 *       vault's own login chain (passphrase, then email OTP) is the
 *       only thing gating this page.
 *
 * PURPOSE:
 * Server-side entry point for the recovery dashboard. Redirects to the
 * right step of the vault's own login chain depending on what the
 * "vaultSession" cookie currently proves, and only renders
 * RecoveryClient once BOTH factors are satisfied.
 *
 * DATA FLOW:
 * 1. No vaultSession cookie at all (missing/expired/malformed) ->
 *    redirect to /system-vault-x9f2/login (factor 1: passphrase)
 * 2. vaultSession present but otpVerified: false -> redirect to
 *    /system-vault-x9f2/otp (factor 2: emailed code,
 *    services/vaultOtp.js)
 * 3. vaultSession present AND otpVerified: true -> render
 *    RecoveryClient, which drives the actual recovery workflow
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "./Recovery.css";
import { requireVaultSessionFromCookieStore } from "@/services/vaultAuth";
import RecoveryClient from "./RecoveryClient";

export const metadata = {
  title: "System Recovery",
  // Same deliberately generic metadata as the login screen — never
  // hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function VaultRecoveryPage() {
  const cookieStore = await cookies();
  const vaultSession = requireVaultSessionFromCookieStore(cookieStore);

  // No session, or it expired/malformed — back to the first factor.
  if (!vaultSession) {
    redirect("/system-vault-x9f2/login");
  }

  // Passphrase accepted but the emailed code hasn't been verified yet.
  if (!vaultSession.otpVerified) {
    redirect("/system-vault-x9f2/otp");
  }

  return <RecoveryClient />;
}
