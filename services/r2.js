/**
 * FILE: services/r2.js
 * PURPOSE:
 * Cloudflare R2 client (S3-compatible) for uploading files server-side.
 * Currently used by scripts/runBackup.js to store nightly database dump
 * files. Server/script-side only — never import in a "use client" file
 * or expose these credentials to the browser.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
