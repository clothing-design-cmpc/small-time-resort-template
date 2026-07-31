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
 *   project root. Scan it with your authenticator app immediately,
 *   then delete the file — never commit it or leave it on disk.
 */
import "./loadEnv.mjs";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import { prisma } from "../services/prisma.js";
import { generateTotpSecret, generateTotpQrCode } from "../services/totp.js";

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

  await prisma.ownerVault.create({ data: { passphraseHash, totpSecret } });

  const qrDataUrl = await generateTotpQrCode(totpSecret);
  const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync("vault-totp-qr.png", base64Data, "base64");

  // The generated passphrase is never stored or shown again after this —
  // it only ever exists in plaintext here, on the owner's own machine.
  if (wasGenerated) {
    console.log("Generated passphrase (save this now — it will not be shown again):");
    console.log(`  ${passphrase}`);
    console.log("");
  }

  console.log("Vault created successfully.");
  console.log("Scan vault-totp-qr.png with your authenticator app now.");
  console.log("Then DELETE vault-totp-qr.png — do not commit it or leave it on disk.");
}

main().finally(() => process.exit());