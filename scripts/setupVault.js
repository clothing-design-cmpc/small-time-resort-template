/**
 * FILE: scripts/setupVault.js
 * PURPOSE:
 * One-time local setup for the owner vault. Run this ONCE on your own
 * machine — never deploy this as an API route, since it's the only
 * place the TOTP secret is ever generated in plaintext.
 *
 * USAGE:
 *   node scripts/setupVault.js "your-chosen-passphrase-min-12-chars"
 *
 * OUTPUT:
 *   Creates the OwnerVault row, then writes vault-totp-qr.png to the
 *   project root. Scan it with your authenticator app immediately,
 *   then delete the file — never commit it or leave it on disk.
 */
import bcrypt from "bcryptjs";
import fs from "fs";
import { prisma } from "../services/prisma.js";
import { generateTotpSecret, generateTotpQrCode } from "../services/totp.js";

async function main() {
  const passphrase = process.argv[2];

  if (!passphrase || passphrase.length < 12) {
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

  console.log("Vault created successfully.");
  console.log("Scan vault-totp-qr.png with your authenticator app now.");
  console.log("Then DELETE vault-totp-qr.png — do not commit it or leave it on disk.");
}

main().finally(() => process.exit());
