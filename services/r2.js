/**
 * FILE: services/r2.js
 * PURPOSE:
 * Initializes the Cloudflare R2 client (S3-compatible) and exports
 * uploadToR2 / deleteFromR2 helpers used by every content-management
 * image upload across the super-admin (rooms, amenities, shop,
 * activities, testimonials, gallery, homepage).
 *
 * SERVER-SIDE ONLY — never import this in a "use client" file. R2
 * credentials must never reach the browser bundle.
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
 * Uploads a processed file buffer to the configured bucket and returns
 * the public CDN URL. The key is the file's path inside the bucket
 * (e.g. "rooms/<uuid>.webp").
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
 * Permanently deletes a file from R2. Called whenever a room image is
 * replaced or a room is deleted, so the bucket never accumulates
 * orphaned files.
 */
export async function deleteFromR2(key) {
  if (!key) return;
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
    })
  );
}
