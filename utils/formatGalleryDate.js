/**
 * FILE: utils/formatGalleryDate.js
 * PURPOSE:
 * Chooses which date to show on a gallery photo — prefers the EXIF
 * "date taken" (GalleryImage.capturedAt, see utils/exifReader.js) when
 * the file had it, since that's what actually makes a photo look
 * "legit" (proof it wasn't just staged/downloaded today), and falls
 * back to the plain upload timestamp (GalleryImage.createdAt) when
 * there's no EXIF data at all. Shared by both the visitor gallery and
 * the super-admin Gallery Management grid so the label logic never
 * drifts between the two.
 */

/**
 * getGalleryImageDisplayDate
 * Returns { label, date } for a gallery image — label is "Taken" when
 * capturedAt is present, "Uploaded" otherwise, and date is a
 * human-readable string (e.g. "Jan 15, 2026"). Returns null if
 * neither date is available (shouldn't happen — createdAt is always
 * set by the DB — but keeps this safe to call defensively).
 */
export function getGalleryImageDisplayDate(image) {
  const rawDate = image?.capturedAt || image?.createdAt;
  if (!rawDate) return null;

  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return {
    label: image?.capturedAt ? "Taken" : "Uploaded",
    date: parsedDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
  };
}
