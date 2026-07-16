/**
 * FILE: app/superAdmin/(protected)/settings/vault-passphrase/page.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Lets the resort owner (not a developer) set the /system-vault-x9f2
 * disaster-recovery passphrase from a button in their own dashboard,
 * instead of running scripts/hashVaultPassphrase.js in a terminal.
 *
 * DATA FLOW:
 * 1. This Server Component just renders the CSS + hands off to
 *    VaultPassphraseClient, which owns the actual fetch/generate flow
 */
import "./VaultPassphrase.css";
import VaultPassphraseClient from "./VaultPassphraseClient";

export const metadata = {
  title: "Vault Passphrase | Super-Admin | Villa Azure Resort",
};

export default function VaultPassphrasePage() {
  return <VaultPassphraseClient />;
}
