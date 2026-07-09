/**
 * FILE: app/superAdmin/(protected)/content/rooms/[roomId]/gallery/RoomGalleryClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Room Gallery sub-page: header with a back link to the
 * room edit form, an upload field, and a grid of every gallery image
 * with "Set as Main", "Feature", and "Delete" controls per image.
 *
 * DATA FLOW:
 * 1. useRoomGallery(roomId) fetches every RoomImage for this room
 * 2. Choosing a file calls uploadImage(), which uploads to R2 then
 *    saves the RoomImage row, then refetches
 * 3. "Set as Main" copies that image's url/key onto the parent Room
 * 4. "Delete" opens ConfirmationModal before removing the image + R2 file
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRoomGallery } from "@/hooks/useRoomGallery";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import "../../Rooms.css";
import "./RoomGallery.css";

export default function RoomGalleryClient({ roomId, roomName }) {
  const { images, isLoading, error, uploadImage, setAsMain, toggleFeatured, deleteImage } = useRoomGallery(roomId);
  const { toasts, showToast, dismissToast } = useToast();

  const [isUploading, setIsUploading] = useState(false);
  const [imagePendingDelete, setImagePendingDelete] = useState(null);

  /**
   * handleFileSelected
   * Uploads the chosen file straight away — the gallery has no
   * separate "save" step, each image is its own record.
   */
  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadImage(file);
      showToast("✓ Image added to gallery.", "success");
    } catch {
      showToast("✕ We couldn't upload this image. Please try again.", "error");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleSetAsMain(image) {
    try {
      await setAsMain(image.id);
      showToast("✓ Set as the room's main image.", "success");
    } catch {
      showToast("✕ We couldn't update the main image. Please try again.", "error");
    }
  }

  async function handleToggleFeatured(image) {
    try {
      await toggleFeatured(image.id, !image.isFeatured);
      showToast(image.isFeatured ? "✓ Removed from featured." : "✓ Marked as featured.", "success");
    } catch {
      showToast("✕ We couldn't update this image. Please try again.", "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteImage(imagePendingDelete.id);
      showToast("✓ Image deleted.", "success");
    } catch {
      showToast("✕ Failed to delete image.", "error");
    } finally {
      setImagePendingDelete(null);
    }
  }

  return (
    <section className="roomsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="roomsHeaderRow">
        <div>
          <span className="roomsEyebrow">Content Management</span>
          <h1 className="roomsTitle">{roomName} — Gallery</h1>
        </div>
        <Link href={`/superAdmin/content/rooms/${roomId}`} className="roomsRowActionButton">
          ← Back to Room
        </Link>
      </div>

      <div className="roomGalleryUploadField">
        <label htmlFor="roomGalleryUpload">Add Image</label>
        <input id="roomGalleryUpload" type="file" accept="image/*" onChange={handleFileSelected} disabled={isUploading} />
        <p className="roomFormHint">
          {isUploading ? "Uploading…" : "Photos here appear in this room's gallery grid on the visitor site."}
        </p>
      </div>

      {isLoading && <p className="roomFormMutedText">Loading gallery…</p>}
      {error && <p className="roomFormError">We couldn&apos;t load this room&apos;s gallery. Please try again.</p>}
      {!isLoading && !error && images.length === 0 && (
        <p className="roomFormMutedText">No gallery images yet. Use &quot;Add Image&quot; above to upload the first one.</p>
      )}

      <div className="roomGalleryGrid">
        {images.map((image) => (
          <article key={image.id} className="roomGalleryCard">
            <div className="roomGalleryImageWrapper">
              <Image src={image.imageUrl} alt={image.caption || "Room gallery photo"} fill sizes="220px" style={{ objectFit: "cover" }} />
              {image.isFeatured && <span className="roomGalleryFeaturedBadge">Featured</span>}
            </div>
            <div className="roomGalleryCardActions">
              <button type="button" className="roomsRowActionButton" onClick={() => handleSetAsMain(image)}>
                Set as Main
              </button>
              <button type="button" className="roomsRowActionButton" onClick={() => handleToggleFeatured(image)}>
                {image.isFeatured ? "Unfeature" : "Feature"}
              </button>
              <button
                type="button"
                className="roomsRowActionButton roomsRowActionButton--destructive"
                onClick={() => setImagePendingDelete(image)}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      <ConfirmationModal
        isOpen={Boolean(imagePendingDelete)}
        title="Delete Gallery Image?"
        description="Are you sure you want to delete this gallery image? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setImagePendingDelete(null)}
      />
    </section>
  );
}
