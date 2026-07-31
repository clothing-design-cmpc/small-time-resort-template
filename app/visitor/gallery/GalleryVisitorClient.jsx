/**
 * FILE: app/visitor/gallery/GalleryVisitorClient.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Owns the active-category tab state for the full gallery page and
 * renders the filtered image grid. The image list itself is fetched
 * once, server-side, by the parent page.jsx — this component only
 * ever filters what it already has in memory, never re-fetches per tab.
 *
 * DATA FLOW:
 * 1. Receives the full `images` array as a prop from
 *    app/visitor/gallery/page.jsx (already Prisma-fetched server-side)
 * 2. Local state (activeCategory) filters the array client-side when
 *    the visitor clicks a category tab — same interaction pattern as
 *    the admin's own GalleryClient.jsx
 */
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { getGalleryImageDisplayDate } from "@/utils/formatGalleryDate";

/* Same category set the admin's Gallery Management tabs use, plus an
   "All" option so a first-time visitor sees everything by default. */
const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "bedroom", label: "Bedrooms" },
  { value: "bathroom", label: "Bathrooms" },
  { value: "common_area", label: "Common Areas" },
  { value: "outdoor", label: "Outdoor" },
  { value: "amenity", label: "Amenities" },
];

export default function GalleryVisitorClient({ images }) {
  const [activeCategory, setActiveCategory] = useState("all");

  // Only recompute the filtered list when the tab or source list changes.
  const filteredImages = useMemo(() => {
    if (activeCategory === "all") return images;
    return images.filter((image) => image.category === activeCategory);
  }, [images, activeCategory]);

  return (
    <div className="galleryVisitorWrapper">
      {/* Category tabs */}
      <div className="galleryVisitorTabs" role="tablist" aria-label="Filter gallery by category">
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            type="button"
            role="tab"
            aria-selected={activeCategory === category.value}
            className={`galleryVisitorTab${activeCategory === category.value ? " galleryVisitorTab--active" : ""}`}
            onClick={() => setActiveCategory(category.value)}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Empty state — no images at all, or none in the selected category */}
      {filteredImages.length === 0 && (
        <div className="galleryVisitorEmptyState">
          <p className="galleryVisitorEmptyTitle">
            {images.length === 0 ? "No photos yet." : "No photos in this category yet."}
          </p>
          <p className="galleryVisitorEmptySubtitle">Check back soon — new photos are added regularly.</p>
        </div>
      )}

      {/* Image grid */}
      {filteredImages.length > 0 && (
        <div className="galleryVisitorGrid">
          {filteredImages.map((image) => (
            <figure key={image.id} className="galleryVisitorFigure">
              <div className="galleryVisitorImageWrapper">
                <Image
                  src={image.imageUrl}
                  alt={image.caption || "your-private-resort"}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="galleryVisitorImage"
                />
              </div>
              {image.caption && <figcaption className="galleryVisitorCaption">{image.caption}</figcaption>}
              {/* Prefers the EXIF "date taken" over the upload date (Rule:
                  utils/formatGalleryDate.js) — this is what lets a guest
                  see a photo wasn't just staged/downloaded today. */}
              {(() => {
                const displayDate = getGalleryImageDisplayDate(image);
                return displayDate ? (
                  <span className="galleryVisitorDate">{displayDate.label} {displayDate.date}</span>
                ) : null;
              })()}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
