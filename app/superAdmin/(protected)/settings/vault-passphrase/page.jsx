/**
 * FILE: app/superAdmin/(protected)/settings/vault-passphrase/page.jsx
 * ROLE: Owner only — not just super-admin. See isOwner check below.
 *
 * PURPOSE:
 * Lets the resort owner (not a developer) set the /system-vault-x9f2
 * disaster-recovery passphrase from a button in their own dashboard,
 * instead of running scripts/hashVaultPassphrase.js in a terminal.
 *
 * Deliberately gated stricter than the rest of /superAdmin: every admin
 * account defaults to role "super_admin" (services/adminSession.js),
 * so role alone can't distinguish the actual owner from any other
 * staff account that might get dashboard access later. This page
 * reveals the hidden vault URL and lets someone invalidate the
 * existing passphrase, so it checks AdminProfile.isOwner specifically
 * and renders a plain notFound() for anyone else — not an "access
 * denied" message, since even hinting this page exists would leak that
 * a hidden recovery system exists to staff who have no business
 * knowing about it.
 *
 * DATA FLOW:
 * 1. Reads the "session" cookie, looks up AdminProfile.isOwner
 * 2. Not the owner (or no valid session) -> notFound() -> standard
 *    Next.js 404, indistinguishable from a URL that was never real
 * 3. Owner -> renders VaultPassphraseClient, which owns the actual
 *    fetch/generate flow (also independently re-checked by
 *    app/api/superAdmin/settings/vault-passphrase/route.js server-side
 *    — this page-level check is a UX/discoverability gate, not the
 *    only enforcement)
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import { requireSuperAdminFromCookieStore } from "@/services/adminSession";
import "./VaultPassphrase.css";
import VaultPassphraseClient from "./VaultPassphraseClient";

export const metadata = {
  title: "Vault Passphrase | Super-Admin | Villa Azure Resort",
};

export default async function VaultPassphrasePage() {
  const cookieStore = await cookies();
  const session = requireSuperAdminFromCookieStore(cookieStore);
  if (!session) notFound();

  const adminProfile = await prisma.adminProfile.findUnique({
    where: { id: session.uid },
    select: { isOwner: true },
  });
  if (!adminProfile?.isOwner) notFound();

  return <VaultPassphraseClient />;
}
