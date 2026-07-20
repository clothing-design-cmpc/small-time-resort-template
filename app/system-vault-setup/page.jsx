/**
 * FILE: app/system-vault-setup/page.jsx
 * ROLE: Standalone — NOT protected by proxy.js's super_admin gate in
 *       the usual dashboard sense, NOT part of the app/superAdmin
 *       route group, NOT wrapped in the Sidebar/AdminHeader shell, and
 *       NOT linked from anywhere in the app. Reached only by typing
 *       this exact URL directly.
 *
 * PURPOSE:
 * Bootstraps/replaces the passphrase in the new, separate
 * VaultPassphrase table (split out from Vault — see
 * prisma/schema.prisma). Deliberately kept outside app/superAdmin, the
 * same way app/system-vault/[vaultSlug] is, so it can never show up in
 * a route listing or a nav link alongside the normal admin pages.
 *
 * WHY THIS CAN'T USE THE VAULT'S OWN "vaultSession" LOGIN:
 * The real disaster-recovery page (app/system-vault/[vaultSlug]) is
 * gated by its own passphrase + OTP login chain — but that passphrase
 * is exactly what this page exists to create in the first place. Until
 * VaultPassphrase.passphraseHash has a value, there's nothing to log in
 * with. So this one page has to fall back to the normal admin
 * "session" cookie + AdminProfile.isOwner check instead — the only
 * credential that can exist before a vault passphrase does. Once a
 * passphrase is generated here, the actual vault login at
 * /system-vault/[vaultSlug] takes over as normal.
 *
 * DATA FLOW:
 * 1. Reads the "session" cookie, looks up AdminProfile.isOwner
 * 2. Not the owner (or no valid session) -> notFound() -> standard
 *    Next.js 404, indistinguishable from a URL that was never real
 * 3. Owner -> renders VaultPassphraseSetupClient, which owns the
 *    actual fetch/generate flow (also independently re-checked by
 *    app/api/system-vault-setup/route.js server-side — this
 *    page-level check is a UX/discoverability gate, not the only
 *    enforcement)
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import { requireSuperAdminFromCookieStore } from "@/services/adminSession";
import "./VaultPassphraseSetup.css";
import VaultPassphraseSetupClient from "./VaultPassphraseSetupClient";

export const metadata = {
  title: "System Setup",
  // Same deliberately generic metadata as the vault login screen —
  // never hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function VaultPassphraseSetupPage() {
  const cookieStore = await cookies();
  const session = requireSuperAdminFromCookieStore(cookieStore);
  if (!session) notFound();

  const adminProfile = await prisma.adminProfile.findUnique({
    where: { id: session.uid },
    select: { isOwner: true },
  });
  if (!adminProfile?.isOwner) notFound();

  return <VaultPassphraseSetupClient />;
}
