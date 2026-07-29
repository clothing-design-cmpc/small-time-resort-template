/**
 * FILE: services/r2.js
 * PURPOSE:
 * Cloudflare R2 client (S3-compatible) for uploading files server-side.
 * Currently used by scripts/runBackup.js to store nightly database dump
 * files. Server/script-side only — never import in a "use client" file
 * or expose these credentials to the browser.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * assertR2Configured
 * Every image upload across the whole admin panel (rooms, gallery,
 * amenities, shop, activities, testimonials, homepage) routes through
 * this client. Previously, a missing .env.local key silently built an
 * endpoint like "https://undefined.r2.cloudflarestorage.com", which
 * fails deep inside the AWS SDK and surfaces to the admin as nothing
 * more than a generic "We couldn't upload this image." — impossible to
 * debug from the UI alone. This check fails fast with the actual
 * missing key name, logged server-side, before any request is made.
 */
function assertR2Configured() {
  const missing = [
    "CLOUDFLARE_R2_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_BUCKET_NAME",
    "NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL",
  ].filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Cloudflare R2 is not configured — missing .env.local key(s): ${missing.join(", ")}. ` +
        "Add these to .env.local and restart the dev server."
    );
  }
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
  // Without this, the AWS SDK defaults to virtual-hosted-style addressing
  // (bucket.accountid.r2.cloudflarestorage.com) — Cloudflare's own R2 docs
  // call this out as a common cause of SignatureDoesNotMatch, since the
  // signed request host can end up not matching what's actually sent.
  // Path-style (accountid.r2.cloudflarestorage.com/bucket/key) is what R2
  // signs reliably.
  forcePathStyle: true,
});

/**
 * uploadToR2
 * Uploads a file buffer to the configured bucket under `key` and
 * returns its public CDN URL (built from NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL).
 *
 * @param {string} key - object path in the bucket, e.g. "backups/2026-07-09.sql.gz"
 * @param {Buffer} buffer
 * @param {string} contentType - e.g. "application/gzip"
 */
export async function uploadToR2(key, buffer, contentType) {
  assertR2Configured();
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `${process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
}

/**
 * deleteFromR2
 * Permanently deletes a single object from the bucket. Used by every
 * content route that replaces or removes an uploaded image (rooms,
 * room gallery, gallery, testimonials, activities, shop products,
 * homepage hero/OG images) so the old file in R2 doesn't become an
 * orphaned, never-cleaned-up object once it's no longer referenced.
 *
 * @param {string} key - the R2 object key stored alongside the image
 *   URL on the record (e.g. Room.imageKey, SystemSettings.heroImageKey)
 */
export async function deleteFromR2(key) {
  if (!key) return; // nothing to delete — record never had an uploaded file
  assertR2Configured();
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
    })  
  );
}

/**
 * getR2SignedDownloadUrl
 * Generates a short-lived, signed GET URL for a private object — used
 * for anything that must NEVER be reachable via the permanent public
 * CDN URL (NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL/<key>), e.g. the vault
 * passphrase backups in services/vaultPassphraseBackup.js. The object
 * itself is uploaded the same way as any other R2 file (uploadToR2) —
 * this function doesn't change how it's stored, only how it's fetched:
 * the returned URL embeds a signature that expires, instead of a
 * stable public path anyone who guesses/finds the key could hit.
 *
 * @param {string} key - object path in the bucket, e.g. "secrets/vault-passphrase-2026-07-25T12-00-00-000Z.txt"
 * @param {number} expiresInSeconds - how long the signed URL stays valid (default: 24h)
 * @returns {Promise<string>} a signed, time-limited download URL
 */
export async function getR2SignedDownloadUrl(key, expiresInSeconds = 24 * 60 * 60) {
  assertR2Configured();
  const command = new GetObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * slugifyForR2Key
 * Turns free text (e.g. a guest's full name) into a safe, lowercase,
 * hyphenated fragment for use inside an R2 object key — strips accents,
 * strips anything that isn't a-z/0-9, collapses repeats, and caps the
 * length so one very long name can't blow out the key. Used by the
 * "directions/" folder (app/api/directions/compute/route.js) so the
 * saved map PNG is named after the guest instead of an opaque booking
 * ID — falls back to "guest" if the input strips down to nothing
 * (e.g. a name that's entirely non-Latin characters).
 *
 * @param {string} text
 */
export function slugifyForR2Key(text) {
  const slug = String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accent marks after decomposition
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "guest";
}