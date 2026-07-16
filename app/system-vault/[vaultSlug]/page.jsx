/**
 * FILE: app/system-vault/[vaultSlug]/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate, NOT
 *       part of the app/superAdmin route group, and NOT linked from
 *       the Sidebar or anywhere else in the app. Gated entirely by its
 *       own login chain plus the [vaultSlug] check below.
 *
 * PURPOSE:
 * The disaster-recovery page for the 3-Gatekeeper breach response
 * (Task 3). Deliberately kept outside app/superAdmin so it can never
 * show up in a route listing alongside the normal admin pages.
 *
 * [vaultSlug] IS NOT A FREE-FORM PARAMETER:
 * This folder is a dynamic route segment, but only ONE value of
 * vaultSlug ever resolves to anything — whatever
 * computeVaultUrlSlug() (services/vaultAuth.js) currently computes
 * from the live passphrase hash. Any other value — a guess, an old
 * cached link from before the last passphrase rotation, a stray bot
 * crawling numeric-looking paths — hits notFound() and gets a plain
 * 404, identical to a route that was never built. This check runs
 * before the vaultSession cookie is even looked at, so a wrong slug
 * never gets far enough to reveal that a login system sits behind it.
 *
 * OWN LOGIN, FULLY SEPARATE FROM /superAdmin/login:
 * This page requires ONLY its own "vaultSession" cookie
 * (services/vaultAuth.js), obtained by completing the vault's own
 * login chain (passphrase, then email OTP) at this same slug's
 * /login and /otp sub-routes. Nothing here is checked against the
 * regular admin "session" cookie, Supabase Auth, or admin_profiles —
 * deliberately, so this recovery path doesn't depend on the same auth
 * stack a breach could plausibly be compromising.
 *
 * DATA FLOW:
 * 1. params.vaultSlug doesn't match computeVaultUrlSlug() -> notFound()
 * 2. No vaultSession cookie at all (missing/expired/malformed) ->
 *    redirect to this slug's /login (factor 1: passphrase)
 * 3. vaultSession present but otpVerified: false -> redirect to this
 *    slug's /otp (factor 2: emailed code, services/vaultOtp.js)
 * 4. vaultSession present AND otpVerified: true -> render
 *    RecoveryClient, which drives the actual recovery workflow
 */
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import "@/app/superAdmin/SuperAdmin.css";
import "./Recovery.css";
import { requireVaultSessionFromCookieStore, computeVaultUrlSlug } from "@/services/vaultAuth";
import RecoveryClient from "./RecoveryClient";

export const metadata = {
  title: "System Recovery",
  // Same deliberately generic metadata as the login screen — never
  // hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function VaultRecoveryPage({ params }) {
  const { vaultSlug } = await params;

  // Wrong (or stale, pre-rotation) slug -> 404, never a redirect that
  // would confirm this route pattern exists at all.
  const expectedSlug = await computeVaultUrlSlug();
  if (!expectedSlug || vaultSlug !== expectedSlug) {
    notFound();
  }

  const cookieStore = await cookies();
  const vaultSession = requireVaultSessionFromCookieStore(cookieStore);

  // No session, or it expired/malformed — back to the first factor.
  if (!vaultSession) {
    redirect(`/system-vault/${vaultSlug}/login`);
  }

  // Passphrase accepted but the emailed code hasn't been verified yet.
  if (!vaultSession.otpVerified) {
    redirect(`/system-vault/${vaultSlug}/otp`);
  }

  return <RecoveryClient />;
}
