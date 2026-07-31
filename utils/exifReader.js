/**
 * FILE: utils/exifReader.js
 * PURPOSE:
 * Reads the "when was this photo actually taken" date embedded by a
 * camera or phone in a photo's EXIF metadata (the DateTimeOriginal /
 * CreateDate tag), separate from the upload timestamp
 * (GalleryImage.createdAt, set automatically by the DB when the admin
 * or guest uploads the file). Showing the EXIF date next to the
 * upload date is what makes a gallery photo verifiably "legit" — a
 * photo can be uploaded today but still show it was actually taken
 * months ago.
 *
 * SERVER-SIDE ONLY. Must run on the RAW uploaded buffer, before
 * utils/imageProcessor.js's processImage() converts it to WebP — the
 * WebP conversion strips EXIF metadata entirely, so if this runs
 * after that conversion there will never be anything to read.
 *
 * Not every photo has this data — screenshots, most social-media
 * downloads, and many desktop screenshots/edits strip EXIF entirely,
 * so this always fails safe to null rather than throwing.
 */
import exifr from "exifr";

/**
 * extractPhotoCapturedAt
 * Parses the raw image buffer for its EXIF "date taken" tag. Returns
 * a JS Date, or null if the photo has no EXIF data, no date tag, or
 * fails to parse for any reason (corrupt/unsupported EXIF block).
 */
export async function extractPhotoCapturedAt(buffer) {
  try {
    // exifr checks DateTimeOriginal first, falling back to CreateDate/
    // ModifyDate — pickers here are the two most reliable "taken" tags.
    const exifData = await exifr.parse(buffer, { pick: ["DateTimeOriginal", "CreateDate"] });
    const capturedAt = exifData?.DateTimeOriginal || exifData?.CreateDate;
    if (!capturedAt) return null;

    const parsedDate = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  } catch (error) {
    // Not every image has EXIF (screenshots, some social-media
    // downloads) — this is an expected, non-error outcome, not a bug.
    console.error("[exifReader] Could not read EXIF date:", error.message);
    return null;
  }
}
