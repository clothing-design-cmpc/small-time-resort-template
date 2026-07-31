/**
 * FILE: services/ownerVaultBackup.js
 * PURPOSE:
 * Backs up the owner vault's TOTP QR code image to Cloudflare R2,
 * mirroring services/vaultPassphraseBackup.js's exact pattern —
 * private `secrets/` key, never the public CDN URL, retrieval only
 * through a presigned (expiring) download link.
 *
 * WHY THIS EXISTS:
 * scripts/setupVault.js writes vault-totp-qr.png to the project root
 * and tells the operator to delete it immediately after scanning —
 * correct for keeping the plaintext QR off disk long-term, but that
 * also means there is no copy left anywhere if the authenticator app
 * entry is ever lost (phone reset, app reinstall, etc.) before a new
 * TOTP secret is generated. This gives that one recovery copy, in the
 * same private, expiring-link pattern already used for the vault
 * passphrase backup — never a permanent public URL.
 *
 * PRIVACY — same rule as vaultPassphraseBackup.js: this uploads to a
 * `secrets/` key and deliberately never returns or logs the permanent
 * public CDN URL uploadToR2() normally hands back. A TOTP QR code
 * image, scanned by anything, hands over the second factor entirely —
 * treat it with the same care as the passphrase itself.
 *
 * IMPORTS ARE RELATIVE ON PURPOSE — this runs from a plain `node`
 * terminal script (scripts/setupVault.js), not from a Next.js API
 * route, so the "@/" alias isn't available here. Same convention
 * services/vaultPassphraseBackup.js already follows.
 */
import { uploadToR2, getR2SignedDownloadUrl } from "./r2.js";

const RETRY_DELAY_MS = 3000;

// Same lifetime as the passphrase backup's signed link — long enough
// to open same-day from the terminal output, short enough that an old
// copy sitting in shell history eventually stops working on its own.
const SIGNED_URL_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * saveOwnerVaultQrToR2
 * Uploads the TOTP QR code PNG to a private `secrets/` key, retrying
 * once on failure before giving up. Never throws — a permanent
 * failure returns { r2Saved: false, r2Key: null, r2SignedUrl: null }
 * so the caller (setupVault.js) can log it and continue; the local
 * vault-totp-qr.png file is still the primary copy either way.
 *
 * @param {Buffer} qrBuffer - raw PNG bytes of the QR code image
 * @returns {Promise<{ r2Saved: boolean, r2Key: string|null, r2SignedUrl: string|null }>}
 */
export async function saveOwnerVaultQrToR2(qrBuffer) {
  const generatedAt = new Date().toISOString();
  // secrets/ prefix keeps this isolated from every public-facing image
  // folder (products/, rooms/, gallery/, etc.) — see Rule 35.8's
  // storage folder naming convention.
  const key = `secrets/owner-vault-qr-${generatedAt.replace(/[:.]/g, "-")}.png`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // uploadToR2()'s own return value (a permanent public CDN URL)
      // is intentionally discarded here — see this file's PRIVACY
      // note. Only the key is kept, and only ever exposed again
      // through a presigned, expiring URL below.
      await uploadToR2(key, qrBuffer, "image/png");
      const r2SignedUrl = await getR2SignedDownloadUrl(key, SIGNED_URL_EXPIRY_SECONDS);
      return { r2Saved: true, r2Key: key, r2SignedUrl };
    } catch (error) {
      const isFinalAttempt = attempt === 2;
      console.error(
        `[ownerVaultBackup] R2 upload attempt ${attempt}/2 failed:`,
        error.message,
        isFinalAttempt ? "— giving up, the local vault-totp-qr.png file is the only copy." : "— retrying once more."
      );
      if (!isFinalAttempt) await sleep(RETRY_DELAY_MS);
    }
  }

  return { r2Saved: false, r2Key: null, r2SignedUrl: null };
}
