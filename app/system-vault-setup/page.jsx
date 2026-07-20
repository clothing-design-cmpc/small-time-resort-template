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
 * with.
 *
 * TWO INDEPENDENT WAYS IN (EITHER is sufficient):
 * 1. The normal admin "session" cookie + AdminProfile.isOwner — the
 *    original path, convenient while logged in normally.
 * 2. A "key" query string matching VAULT_SETUP_KEY
 *    (services/adminSession.js's isValidVaultSetupKey()) — an
 *    env-only secret that never touches the database.
 * Path 1 alone used to be the only way in, which meant this page went
 * down with the site any time scripts/runDatabaseWipe.js ran: that
 * script deliberately truncates admin_profiles along with everything
 * else (TABLES_TO_PRESERVE in that file does not list it — a
 * compromised admin account must never be the way back in after a
 * real wipe), so the isOwner lookup below always failed post-wipe
 * regardless of whether the session cookie itself was still present.
 * Path 2 fixes that: VAULT_SETUP_KEY lives only in the deployment's
 * environment, so it survives a TRUNCATE untouched, giving the owner
 * a way to reach this page — and therefore generate/regenerate the
 * vault passphrase used by /system-vault/[vaultSlug] — with no
 * database read involved at all. Once a passphrase is generated here,
 * the actual vault login at /system-vault/[vaultSlug] takes over as
 * normal.
 *
 * DATA FLOW:
 * 1. Reads the "key" search param -> isValidVaultSetupKey()
 * 2. Valid key -> skip straight to rendering, no DB read at all
 * 3. No valid key -> falls back to reading the "session" cookie and
 *    looking up AdminProfile.isOwner, same as before
 * 4. Neither credential valid -> notFound() -> standard Next.js 404,
 *    indistinguishable from a URL that was never real
 * 5. Either credential valid -> renders VaultPassphraseSetupClient,
 *    which owns the actual fetch/generate flow (also independently
 *    re-checked by app/api/system-vault-setup/route.js server-side —
 *    this page-level check is a UX/discoverability gate, not the only
 *    enforcement) — passed the setup key (if that's the credential
 *    that worked) so it can forward it on every fetch call, since a
 *    key-authenticated visit has no session cookie for those API
 *    calls to ride along on
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import { requireSuperAdminFromCookieStore, isValidVaultSetupKey } from "@/services/adminSession";
import "./VaultPassphraseSetup.css";
import VaultPassphraseSetupClient from "./VaultPassphraseSetupClient";

export const metadata = {
  title: "System Setup",
  // Same deliberately generic metadata as the vault login screen —
  // never hint at what this gates to anyone who stumbles onto the URL.
  description: "Restricted access.",
};

export default async function VaultPassphraseSetupPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const providedKey = resolvedSearchParams?.key;

  // Path 2 first — a valid key needs no cookie and no database read,
  // so it works even when postWipeLockdown has wiped admin_profiles
  // and cleared the session cookie on every other route.
  if (isValidVaultSetupKey(providedKey)) {
    return <VaultPassphraseSetupClient vaultSetupKey={providedKey} />;
  }

  // Path 1 — original behavior, unchanged: normal admin session +
  // isOwner check, for convenient access while already logged in.
  const cookieStore = await cookies();
  const session = requireSuperAdminFromCookieStore(cookieStore);
  if (!session) notFound();

  const adminProfile = await prisma.adminProfile.findUnique({
    where: { id: session.uid },
    select: { isOwner: true },
  });
  if (!adminProfile?.isOwner) notFound();

  return <VaultPassphraseSetupClient vaultSetupKey={null} />;
}
