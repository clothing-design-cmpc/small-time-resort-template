/**
 * FILE: app/visitor/gallery/page.jsx
 * ROLE: Visitor — public, standalone page (same tier as /visitor/policies)
 *
 * PURPOSE:
 * Full resort photo gallery. Previously this page did not exist at
 * all — the GalleryImage table and its admin CRUD worked correctly,
 * but there was no way for a guest to browse resort photos anywhere
 * on the live site.
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor/gallery" (linked from the header nav and
 *    from the homepage's GalleryPreviewSection "View Full Gallery" link)
 * 2. Server Component reads the GalleryImage table directly via Prisma
 *    (same pattern app/visitor/policies/page.jsx already uses) — all
 *    images, ordered by category then displayOrder
 * 3. Full image list is handed to GalleryVisitorClient, a small Client
 *    Component that owns the active-category tab state and filters
 *    client-side — no extra network round trip per tab, mirroring the
 *    admin's own GalleryClient.jsx tab pattern
 */
import { prisma } from "@/services/prisma";
import GalleryVisitorClient from "./GalleryVisitorClient";
import "./Gallery.css";

export const metadata = {
  title: "Gallery | Villa Azure Resort",
  description: "Browse photos of our villas, common areas, and grounds.",
};

export default async function VisitorGalleryPage() {
  const images = await prisma.galleryImage
    .findMany({
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
      select: { id: true, category: true, imageUrl: true, caption: true },
    })
    .catch(() => []);

  return (
    <main className="galleryPageMain">
      <div className="galleryPageHeader">
        <span className="galleryPageEyebrow">Photo Gallery</span>
        <h1 className="galleryPageTitle">Around Villa Azure</h1>
        <p className="galleryPageSubtitle">
          A closer look at the villas, common areas, and grounds — before you arrive.
        </p>
      </div>

      <GalleryVisitorClient images={images} />
    </main>
  );
}
