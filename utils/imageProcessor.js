/**
 * FILE: utils/imageProcessor.js
 * PURPOSE:
 * Resizes, compresses, and converts uploaded images to WebP before they
 * are stored in Cloudflare R2. Keeps bucket storage and page-load size
 * small across every content-management image upload.
 *
 * SERVER-SIDE ONLY.
 */
import sharp from "sharp";

/**
 * processImage
 * Resizes the image to fit within maxWidth x maxHeight (never upscales,
 * never distorts aspect ratio), compresses it, and converts to WebP.
 */
export async function processImage(buffer, options = {}) {
  const { maxWidth = 1600, maxHeight = 1600, quality = 80 } = options;

  return sharp(buffer)
    .resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();
}
