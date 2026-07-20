/**
 * FILE: app/superAdmin/(protected)/settings/vault-passphrase-generator/page.jsx
 * ROLE: Owner only — not just super-admin. See isOwner check below.
 *
 * PURPOSE:
 * Standalone page for generating the first/next passphrase now that
 * VaultPassphrase lives in its own table, split out from Vault. The
 * old table went empty the moment the split happened, so the old
 * recovery vault could not be opened until a fresh passphrase was
 * generated into the new table — this page is where the owner does
 * that from their own dashboard, same as
 * settings/vault-passphrase/page.jsx did for the old column.
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
 * 3. Owner -> renders VaultPassphraseGeneratorClient, which owns the
 *    actual fetch/generate flow (also independently re-checked by
 *    app/api/superAdmin/settings/vault-passphrase-generator/route.js
 *    server-side — this page-level check is a UX/discoverability
 *    gate, not the only enforcement)
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import { requireSuperAdminFromCookieStore } from "@/services/adminSession";
import "./VaultPassphraseGenerator.css";
import VaultPassphraseGeneratorClient from "./VaultPassphraseGeneratorClient";

export const metadata = {
  title: "Vault Passphrase Generator | Super-Admin | Villa Azure Resort",
};

export default async function VaultPassphraseGeneratorPage() {
  const cookieStore = await cookies();
  const session = requireSuperAdminFromCookieStore(cookieStore);
  if (!session) notFound();

  const adminProfile = await prisma.adminProfile.findUnique({
    where: { id: session.uid },
    select: { isOwner: true },
  });
  if (!adminProfile?.isOwner) notFound();

  return <VaultPassphraseGeneratorClient />;
}
