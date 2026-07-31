/**
 * FILE: scripts/setupVault.js
 * PURPOSE:
 * One-time local setup for the owner vault. Run this ONCE on your own
 * machine — never deploy this as an API route, since it's the only
 * place the TOTP secret is ever generated in plaintext.
 *
 * USAGE:
 *   node scripts/setupVault.js
 *     → auto-generates a cryptographically random passphrase and prints
 *       it once to the terminal. Save it immediately — it is never
 *       stored or shown again.
 *   node scripts/setupVault.js "your-chosen-passphrase-min-12-chars"
 *     → uses your own passphrase instead of generating one.
 *
 * OUTPUT:
 *   Creates the OwnerVault row, then writes vault-totp-qr.png to the
 *   project root AND uploads a copy to a private Cloudflare R2
 *   secrets/ key (services/ownerVaultBackup.js) as a recovery copy —
 *   scan the local file with your authenticator app immediately,
 *   then delete it — never commit it or leave it on disk. Prints a
 *   confirmation (row id + passphrase hash) after saving so you can
 *   verify the row actually landed in the database.
 */
import "./loadEnv.mjs";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import { prisma } from "../services/prisma.js";
import { generateTotpSecret, generateTotpQrCode } from "../services/totp.js";
import { saveOwnerVaultQrToR2 } from "../services/ownerVaultBackup.js";

/**
 * generatePassphrase
 * Creates a cryptographically random, URL-safe passphrase of at least
 * 12 characters (default 24) using Node's crypto module — never Math.random().
 */
function generatePassphrase(length = 24) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

async function main() {
  let passphrase = process.argv[2];
  let wasGenerated = false;

  // No passphrase provided — auto-generate a secure one instead of failing.
  if (!passphrase) {
    passphrase = generatePassphrase();
    wasGenerated = true;
  }

  if (passphrase.length < 12) {
    console.error("Provide a passphrase of at least 12 characters as the first argument.");
    process.exit(1);
  }

  // Refuse to run if a vault already exists — prevents accidentally
  // wiping out the owner's existing TOTP pairing.
  const existing = await prisma.ownerVault.findFirst();
  if (existing) {
    console.error("A vault already exists. Delete the OwnerVault row manually first if you intend to reset.");
    process.exit(1);
  }

  const passphraseHash = await bcrypt.hash(passphrase, 12);
  const totpSecret = generateTotpSecret();

  const createdVault = await prisma.ownerVault.create({ data: { passphraseHash, totpSecret } });

  const qrDataUrl = await generateTotpQrCode(totpSecret);
  const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
  const qrBuffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync("vault-totp-qr.png", qrBuffer);

  // Best-effort backup to Cloudflare R2 (private secrets/ key, never
  // the public CDN URL) — never blocks vault creation itself if it
  // fails, since the local file is already the primary copy.
  console.log("Backing up QR code to Cloudflare R2…");
  const { r2Saved, r2SignedUrl } = await saveOwnerVaultQrToR2(qrBuffer);

  // The generated passphrase is never stored or shown again after this —
  // it only ever exists in plaintext here, on the owner's own machine.
  if (wasGenerated) {
    console.log("Generated passphrase (save this now — it will not be shown again):");
    console.log(`  ${passphrase}`);
    console.log("");
  }

  // Confirmation that the row actually landed in the database — the
  // hash is safe to print (unlike the plaintext passphrase above, a
  // bcrypt hash can't be used to log in on its own) and gives an
  // immediate way to verify the save without opening Supabase.
  console.log("Saved to database:");
  console.log(`  owner_vault row id: ${createdVault.id}`);
  console.log(`  passphrase hash:    ${passphraseHash}`);
  console.log("");

  console.log("Vault created successfully.");
  console.log("Scan vault-totp-qr.png with your authenticator app now.");
  console.log("Then DELETE vault-totp-qr.png — do not commit it or leave it on disk.");
  console.log(
    r2Saved
      ? `QR code also backed up to Cloudflare R2 (signed link, expires in 24h): ${r2SignedUrl}`
      : "Could not back up the QR code to Cloudflare R2 — check R2 credentials in .env.local. The local vault-totp-qr.png file is still the only copy, so scan it before deleting."
  );
}

main().finally(() => process.exit());