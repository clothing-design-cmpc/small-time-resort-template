/**
 * FILE: components/sections/GalleryPreviewSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Homepage teaser showing a handful of gallery photos, with a link
 * through to the full /visitor/gallery page.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after ActivitiesHighlightSection
 * 2. Server Component reads the GalleryImage table directly via Prisma
 *    (same pattern app/visitor/policies/page.jsx already uses),
 *    preferring isFeatured images, capped at 6 for the homepage strip
 * 3. Fails safe to an empty array — the section renders nothing rather
 *    than a broken/empty grid if no images exist yet
 */
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/services/prisma";
import "./GalleryPreviewSection.css";

export default async function GalleryPreviewSection() {
  const featured = await prisma.galleryImage
    .findMany({
      where: { isFeatured: true },
      orderBy: { displayOrder: "asc" },
      take: 6,
    })
    .catch(() => []);

  const fallback =
    featured.length > 0
      ? []
      : await prisma.galleryImage
          .findMany({ orderBy: { displayOrder: "asc" }, take: 6 })
          .catch(() => []);

  const images = featured.length > 0 ? featured : fallback;

  // Nothing to show yet — admin hasn't uploaded any gallery images.
  if (images.length === 0) return null;

  return (
    <section className="galleryPreviewSection" id="gallery">
      <div className="galleryPreviewContainer">
        <div className="galleryPreviewHeader">
          <span className="galleryPreviewEyebrow">Photo Gallery</span>
          <h2 className="galleryPreviewTitle">A Closer Look</h2>
        </div>

        <div className="galleryPreviewGrid">
          {images.map((image) => (
            <div key={image.id} className="galleryPreviewImageWrapper">
              <Image
                src={image.imageUrl}
                alt={image.caption || "your-private-resort"}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="galleryPreviewImage"
              />
            </div>
          ))}
        </div>

        <div className="galleryPreviewViewAll">
          <Link href="/visitor/gallery" className="galleryPreviewViewAllLink">
            View full gallery →
          </Link>
        </div>
      </div>
    </section>
  );
}
