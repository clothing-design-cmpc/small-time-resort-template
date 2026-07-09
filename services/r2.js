/**
 * FILE: services/r2.js
 * PURPOSE:
 * Cloudflare R2 client (S3-compatible) for uploading files server-side.
 * Currently used by scripts/runBackup.js to store nightly database dump
 * files. Server/script-side only — never import in a "use client" file
 * or expose these credentials to the browser.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
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
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
    })
  );
}