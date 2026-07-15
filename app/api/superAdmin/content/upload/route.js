/**
 * FILE: app/api/superAdmin/content/upload/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Shared image upload endpoint for every content-management form
 * (rooms, amenities, shop, activities, testimonials, gallery,
 * homepage). Validates the file, resizes/compresses/converts it to
 * WebP, uploads it to Cloudflare R2 under the requested folder, and
 * returns the public URL + object key (the key is saved alongside the
 * URL so the old file can be deleted on replace).
 *
 * DATA FLOW:
 * 1. Client form submits multipart/form-data: file + folder (e.g. "rooms")
 * 2. Reject non-image types and files over 5MB
 * 3. processImage() resizes to max 1600px and converts to WebP
 * 4. uploadToR2() stores the file and returns the CDN URL
 * 5. { success, data: { url, key } } is returned for the form to save
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { processImage } from "@/utils/imageProcessor";
import { uploadToR2 } from "@/services/r2";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = formData.get("folder") || "uploads";

    if (!file) {
      return NextResponse.json(
        { success: false, data: null, message: "No file was provided." },
        { status: 400 }
      );
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, data: null, message: "Only JPEG, PNG, WebP, and GIF files are accepted." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, data: null, message: "File is too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const processedBuffer = await processImage(rawBuffer);
    const fileKey = `${folder}/${randomUUID()}.webp`;
    const publicUrl = await uploadToR2(fileKey, processedBuffer, "image/webp");

    return NextResponse.json({
      success: true,
      data: { url: publicUrl, key: fileKey },
      message: "Image uploaded successfully.",
    });
  } catch (error) {
    console.error("[Upload] Failed:", error);
    // This is an internal super-admin-only tool (never visitor-facing), so
    // surfacing the real reason — e.g. missing R2 env vars — is genuinely
    // more helpful than Rule 34.1's generic guest-facing message would be.
    // Falls back to the generic message if the error has no useful text.
    const detail = error?.message?.startsWith("Cloudflare R2 is not configured")
      ? error.message
      : "We couldn't upload this image. Please try again.";
    return NextResponse.json({ success: false, data: null, message: detail }, { status: 500 });
  }
}
