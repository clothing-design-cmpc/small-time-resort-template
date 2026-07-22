/**
 * FILE: app/visitor/rooms/[slug]/RoomDetailClient.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Renders the room's photo gallery: a large main image with a
 * thumbnail strip below it (clicking a thumbnail swaps the main image),
 * and a full-size lightbox modal (clicking the main image opens it,
 * with Prev/Next navigation and Escape-to-close).
 *
 * DATA FLOW:
 * 1. Receives the already-Prisma-fetched `images` array as a prop from
 *    page.jsx (Server Component) — no client-side fetch needed
 * 2. Local state only: which index is the current main image, and
 *    whether the lightbox is open
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

export default function RoomDetailClient({ images, roomName }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const activeImage = images[activeIndex] ?? images[0];

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current === 0 ? images.length - 1 : current - 1));
  }, [images.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current === images.length - 1 ? 0 : current + 1));
  }, [images.length]);

  // Keyboard navigation while the lightbox is open — Escape closes it,
  // arrow keys move between photos without needing to click the buttons.
  useEffect(() => {
    if (!isLightboxOpen) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") setIsLightboxOpen(false);
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, showPrevious, showNext]);

  if (images.length === 0) {
    return (
      <div className="roomDetailGalleryEmpty">
        <p>No photos available for this room yet.</p>
      </div>
    );
  }

  return (
    <div className="roomDetailGallery">
      {/* Main image — click to open the full-size lightbox */}
      <button
        type="button"
        className="roomDetailMainImageWrapper"
        onClick={() => setIsLightboxOpen(true)}
        aria-label="View full-size photo"
      >
        <Image
          src={activeImage.imageUrl}
          alt={activeImage.caption || roomName}
          fill
          priority
          className="roomDetailMainImage"
          sizes="(max-width: 1024px) 100vw, 900px"
        />
      </button>

      {/* Thumbnail strip — only shown when there's more than one photo */}
      {images.length > 1 && (
        <div className="roomDetailThumbnailStrip" role="tablist" aria-label={`${roomName} photos`}>
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`roomDetailThumbnail${index === activeIndex ? " roomDetailThumbnail--active" : ""}`}
              onClick={() => setActiveIndex(index)}
            >
              <Image
                src={image.imageUrl}
                alt={image.caption || `${roomName} photo ${index + 1}`}
                fill
                className="roomDetailThumbnailImage"
                sizes="120px"
              />
            </button>
          ))}
        </div>
      )}

      {/* Full-size lightbox */}
      {isLightboxOpen && (
        <div
          className="roomDetailLightboxBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Full-size photo viewer"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            className="roomDetailLightboxClose"
            onClick={() => setIsLightboxOpen(false)}
            aria-label="Close photo viewer"
          >
            ✕
          </button>

          {images.length > 1 && (
            <button
              type="button"
              className="roomDetailLightboxNav roomDetailLightboxNav--prev"
              onClick={(event) => {
                event.stopPropagation();
                showPrevious();
              }}
              aria-label="Previous photo"
            >
              ‹
            </button>
          )}

          {/* Stop propagation so clicking the image itself doesn't close the modal */}
          <div className="roomDetailLightboxImageWrapper" onClick={(event) => event.stopPropagation()}>
            <Image
              src={activeImage.imageUrl}
              alt={activeImage.caption || roomName}
              fill
              className="roomDetailLightboxImage"
              sizes="100vw"
            />
          </div>

          {images.length > 1 && (
            <button
              type="button"
              className="roomDetailLightboxNav roomDetailLightboxNav--next"
              onClick={(event) => {
                event.stopPropagation();
                showNext();
              }}
              aria-label="Next photo"
            >
              ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}
