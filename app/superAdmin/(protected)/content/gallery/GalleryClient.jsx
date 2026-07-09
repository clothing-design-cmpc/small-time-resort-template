/**
 * FILE: app/superAdmin/(protected)/content/gallery/GalleryClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Gallery Management view: category tabs, the image grid
 * (thumbnail, category tag, order number, per-image actions), the
 * upload modal, a delete confirmation modal, and the toast stack
 * (blueprint Page 6).
 *
 * DATA FLOW:
 * 1. useGallery() fetches every gallery image on mount
 * 2. The active tab filters galleryImages to the selected category,
 *    sorted by displayOrder, purely on the client — no re-fetch per tab
 * 3. Move Up/Down calls moveImageInCategory(); Set Featured and
 *    Delete call updateGalleryImage()/deleteGalleryImage() directly
 */
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useGallery } from "@/hooks/useGallery";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import GalleryUploadModal from "./GalleryUploadModal";

const CATEGORIES = [
  { value: "bedroom", label: "Bedrooms" },
  { value: "bathroom", label: "Bathrooms" },
  { value: "common_area", label: "Common Areas" },
  { value: "outdoor", label: "Outdoor" },
  { value: "amenity", label: "Amenities" },
];

export default function GalleryClient() {
  const {
    galleryImages,
    isLoading,
    error,
    uploadGalleryImage,
    updateGalleryImage,
    deleteGalleryImage,
    moveImageInCategory,
  } = useGallery();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeCategory, setActiveCategory] = useState("bedroom");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [imagePendingDelete, setImagePendingDelete] = useState(null);

  // Filtered + sorted purely on the client — switching tabs never
  // re-fetches, since useGallery() already loaded the full set.
  const visibleImages = useMemo(
    () =>
      galleryImages
        .filter((image) => image.category === activeCategory)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [galleryImages, activeCategory]
  );

  async function handleUpload(payload) {
    try {
      await uploadGalleryImage(payload);
      showToast("✓ Image uploaded to the gallery successfully.", "success");
      setIsUploadModalOpen(false);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't upload this image. Please try again.";
      showToast(`✕ ${message}`, "error");
      throw submitError; // let the modal keep its own error state too
    }
  }

  async function handleToggleFeatured(image) {
    try {
      await updateGalleryImage(image.id, { isFeatured: !image.isFeatured });
      showToast(image.isFeatured ? "✓ Removed from featured." : "✓ Marked as featured.", "success");
    } catch {
      showToast("✕ Couldn't update this image. Please try again.", "error");
    }
  }

  async function handleMove(image, direction) {
    try {
      await moveImageInCategory(image, direction);
    } catch {
      showToast("✕ Couldn't reorder this image. Please try again.", "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteGalleryImage(imagePendingDelete.id);
      showToast("✓ Image deleted from the gallery.", "success");
    } catch {
      showToast("✕ Failed to delete this image.", "error");
    } finally {
      setImagePendingDelete(null);
    }
  }

  return (
    <section className="gallerySection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="galleryHeaderRow">
        <div>
          <span className="galleryEyebrow">Content Management</span>
          <h1 className="galleryTitle">Gallery</h1>
        </div>
        <button type="button" className="galleryAddButton" onClick={() => setIsUploadModalOpen(true)}>
          + Upload Image
        </button>
      </div>

      <div className="galleryTabs" role="tablist">
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            type="button"
            role="tab"
            aria-selected={activeCategory === category.value}
            className={`galleryTab${activeCategory === category.value ? " galleryTab--active" : ""}`}
            onClick={() => setActiveCategory(category.value)}
          >
            {category.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="galleryStateMessage galleryStateMessage--error">
          We couldn&apos;t load the gallery. Please try again.
        </div>
      )}

      {!error && isLoading && (
        <div className="galleryGrid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="galleryCard galleryCard--skeleton" />
          ))}
        </div>
      )}

      {!error && !isLoading && visibleImages.length === 0 && (
        <div className="galleryStateMessage">
          No images in this category yet. Click &ldquo;Upload Image&rdquo; to add the first one.
        </div>
      )}

      {!error && !isLoading && visibleImages.length > 0 && (
        <div className="galleryGrid">
          {visibleImages.map((image, index) => (
            <div key={image.id} className="galleryCard">
              <div className="galleryCardImageWrapper">
                <Image src={image.imageUrl} alt={image.caption || "Resort gallery photo"} fill sizes="240px" style={{ objectFit: "cover" }} />
                {image.isFeatured && <span className="galleryFeaturedTag">Featured</span>}
              </div>

              <div className="galleryCardMeta">
                <span className="galleryCardOrder">#{index + 1}</span>
                {image.caption && <span className="galleryCardCaption">{image.caption}</span>}
              </div>

              <div className="galleryCardActions">
                <button type="button" className="galleryCardActionButton" disabled={index === 0} onClick={() => handleMove(image, "up")}>
                  ↑ Up
                </button>
                <button
                  type="button"
                  className="galleryCardActionButton"
                  disabled={index === visibleImages.length - 1}
                  onClick={() => handleMove(image, "down")}
                >
                  ↓ Down
                </button>
                <button type="button" className="galleryCardActionButton" onClick={() => handleToggleFeatured(image)}>
                  {image.isFeatured ? "Unfeature" : "Feature"}
                </button>
                <button
                  type="button"
                  className="galleryCardActionButton galleryCardActionButton--destructive"
                  onClick={() => setImagePendingDelete(image)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GalleryUploadModal
        isOpen={isUploadModalOpen}
        defaultCategory={activeCategory}
        onSubmit={handleUpload}
        onCancel={() => setIsUploadModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={Boolean(imagePendingDelete)}
        title="Delete Image?"
        description="Are you sure you want to delete this gallery image? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setImagePendingDelete(null)}
      />
    </section>
  );
}
