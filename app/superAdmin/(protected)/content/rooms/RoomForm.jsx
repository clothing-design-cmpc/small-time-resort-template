/**
 * FILE: app/superAdmin/(protected)/content/rooms/RoomForm.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create/Edit form for a single room (blueprint Page 1). Shared by the
 * "new" and "[roomId]" routes — `existingRoom` is null for create mode.
 * Handles image upload to R2, amenity multi-select, and all room fields
 * from the blueprint spec.
 *
 * DATA FLOW:
 * 1. React Hook Form + Zod validate the fields on submit (Rule 31.7)
 * 2. If a new image file was chosen, it's uploaded to
 *    /api/superAdmin/content/upload first — the returned url/key are
 *    then included in the room payload
 * 3. POST (create) or PUT (edit) to /api/superAdmin/content/rooms —
 *    on success, show a toast and redirect back to the list
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import Image from "next/image";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./RoomForm.css";

const BED_TYPES = ["King", "Queen", "Twin", "Double", "Sofa Bed"];

const roomSchema = z.object({
  name: z.string().min(1, "Room name is required."),
  slug: z.string().min(1, "Slug is required."),
  description: z.string().optional(),
  pricePerNight: z.coerce.number().min(0, "Price must be 0 or more."),
  capacity: z.coerce.number().min(1, "Max guests must be at least 1."),
  bedType: z.string().min(1),
  minNightsPerBooking: z.coerce.number().min(1),
  maxNightsPerBooking: z.coerce.number().min(1),
  minGuestsAllowed: z.coerce.number().min(1),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
});

/**
 * slugify
 * Auto-generates a URL-safe slug from the room name. Only used to
 * pre-fill the slug field — the admin can still edit it by hand.
 */
function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function RoomForm({ existingRoom, amenities }) {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToast();
  const isEditMode = Boolean(existingRoom);

  const [imagePreviewUrl, setImagePreviewUrl] = useState(existingRoom?.imageUrl ?? null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedAmenityIds, setSelectedAmenityIds] = useState(existingRoom?.amenityIds ?? []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      name: existingRoom?.name ?? "",
      slug: existingRoom?.slug ?? "",
      description: existingRoom?.description ?? "",
      pricePerNight: existingRoom?.pricePerNight ?? 0,
      capacity: existingRoom?.capacity ?? 2,
      bedType: existingRoom?.bedType ?? "King",
      minNightsPerBooking: existingRoom?.minNightsPerBooking ?? 1,
      maxNightsPerBooking: existingRoom?.maxNightsPerBooking ?? 30,
      minGuestsAllowed: existingRoom?.minGuestsAllowed ?? 1,
      isFeatured: existingRoom?.isFeatured ?? false,
      isActive: existingRoom?.isActive ?? true,
    },
  });

  const nameValue = watch("name");

  /**
   * handleAutoSlug
   * Fills the slug field from the current name value, but only in
   * create mode — editing an existing room's name should never
   * silently change its live URL slug.
   */
  function handleAutoSlug() {
    if (!isEditMode) {
      setValue("slug", slugify(nameValue || ""), { shouldValidate: true });
    }
  }

  function toggleAmenity(amenityId) {
    setSelectedAmenityIds((current) =>
      current.includes(amenityId) ? current.filter((id) => id !== amenityId) : [...current, amenityId]
    );
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  /**
   * onSubmit
   * Uploads the image first (if a new one was chosen), then creates or
   * updates the room with the resulting URL/key plus all form fields.
   */
  async function onSubmit(data) {
    try {
      let imageUrl = existingRoom?.imageUrl ?? null;
      let imageKey = existingRoom?.imageKey ?? null;

      if (selectedImageFile) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", selectedImageFile);
        uploadFormData.append("folder", "rooms");

        const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);
        imageUrl = uploadResponse.data.data.url;
        imageKey = uploadResponse.data.data.key;
      }

      const payload = {
        ...data,
        imageUrl,
        imageKey,
        amenityIds: selectedAmenityIds,
        sortOrder: existingRoom?.sortOrder ?? 0,
      };

      if (isEditMode) {
        await axios.put(`/api/superAdmin/content/rooms/${existingRoom.id}`, payload);
        showToast("✓ Room updated successfully.", "success");
      } else {
        await axios.post("/api/superAdmin/content/rooms", payload);
        showToast(`✓ Room "${data.name}" added successfully.`, "success");
      }

      router.push("/superAdmin/content/rooms");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this room. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  return (
    <section className="roomFormSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="roomFormHeaderRow">
        <span className="roomsEyebrow">Content Management</span>
        <h1 className="roomsTitle">{isEditMode ? "Edit Room" : "Add Room"}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="roomForm">
        {/* --- Basic Details --- */}
        <div className="roomFormSectionGroup">
          <h2 className="roomFormSectionTitle">Basic Details</h2>
          <p className="roomFormSectionSubtitle">What the room is called and how it&apos;s described to guests.</p>

          <div className="roomFormField">
            <label htmlFor="roomName">Room Name <span aria-hidden="true">*</span></label>
            <input
              id="roomName"
              type="text"
              autoFocus
              {...register("name", { onBlur: handleAutoSlug })}
            />
            <p className="roomFormHint">The name shown to guests, e.g. &quot;Garden Suite&quot; or &quot;Ocean View Villa&quot;.</p>
            {errors.name && <span role="alert" className="roomFormError">{errors.name.message}</span>}
          </div>

          <div className="roomFormField">
            <label htmlFor="roomDescription">Description</label>
            <textarea id="roomDescription" rows={4} {...register("description")} />
            <p className="roomFormHint">Shown on the room&apos;s page on the visitor site — describe the space, view, and what makes it special.</p>
          </div>

          <details className="roomFormAdvanced">
            <summary>Advanced: URL slug</summary>
            <div className="roomFormField">
              <label htmlFor="roomSlug">Slug <span aria-hidden="true">*</span></label>
              <input id="roomSlug" type="text" {...register("slug")} />
              <p className="roomFormHint">Auto-filled from the name. This becomes part of the room&apos;s live web address — only change it if you know it will update the link guests use.</p>
              {errors.slug && <span role="alert" className="roomFormError">{errors.slug.message}</span>}
            </div>
          </details>
        </div>

        {/* --- Pricing & Capacity --- */}
        <div className="roomFormSectionGroup">
          <h2 className="roomFormSectionTitle">Pricing &amp; Capacity</h2>
          <p className="roomFormSectionSubtitle">What it costs per night and who it&apos;s built for.</p>

          <div className="roomFormRow">
            <div className="roomFormField">
              <label htmlFor="roomPrice">Price / Night (₱) <span aria-hidden="true">*</span></label>
              <input id="roomPrice" type="number" step="0.01" {...register("pricePerNight")} />
              <p className="roomFormHint">Base rate per night, before any seasonal pricing or surcharges from Booking Rules.</p>
              {errors.pricePerNight && <span role="alert" className="roomFormError">{errors.pricePerNight.message}</span>}
            </div>

            <div className="roomFormField">
              <label htmlFor="roomCapacity">Max Guests <span aria-hidden="true">*</span></label>
              <input id="roomCapacity" type="number" {...register("capacity")} />
              <p className="roomFormHint">The most guests allowed in this room at once, regardless of bed count.</p>
              {errors.capacity && <span role="alert" className="roomFormError">{errors.capacity.message}</span>}
            </div>

            <div className="roomFormField">
              <label htmlFor="roomBedType">Bed Type</label>
              <select id="roomBedType" {...register("bedType")}>
                {BED_TYPES.map((bedType) => (
                  <option key={bedType} value={bedType}>{bedType}</option>
                ))}
              </select>
              <p className="roomFormHint">The main bed configuration shown on the room card.</p>
            </div>
          </div>
        </div>

        {/* --- Photo --- */}
        <div className="roomFormSectionGroup">
          <h2 className="roomFormSectionTitle">Photo</h2>
          <div className="roomFormField">
            <label htmlFor="roomImage">Main Image</label>
            <div className="roomFormImageUpload">
              {imagePreviewUrl && (
                <div className="roomFormImagePreviewWrapper">
                  {/* unoptimized for a freshly-selected local file — its blob: URL
                      is never a configured remote host for next/image to optimize */}
                  <Image
                    src={imagePreviewUrl}
                    alt="Room preview"
                    fill
                    sizes="200px"
                    style={{ objectFit: "cover" }}
                    unoptimized={Boolean(selectedImageFile)}
                  />
                </div>
              )}
              <input id="roomImage" type="file" accept="image/*" onChange={handleImageChange} />
            </div>
            <p className="roomFormHint">The cover photo used on the room list, homepage (if featured), and booking cards. Recommended 16:9.</p>
          </div>
        </div>

        {/* --- Amenities --- */}
        <div className="roomFormSectionGroup">
          <h2 className="roomFormSectionTitle">Amenities</h2>
          <div className="roomFormField">
            <label>Room Amenities</label>
            <p className="roomFormHint">Check every amenity available in this specific room — these show as icons on the room&apos;s page. Manage the amenity list itself under Content &gt; Amenities.</p>
            <div className="roomFormAmenityGrid">
              {amenities.length === 0 && <p className="roomFormMutedText">No amenities created yet.</p>}
              {amenities.map((amenity) => (
                <label key={amenity.id} className="roomFormAmenityCheckbox">
                  <input
                    type="checkbox"
                    checked={selectedAmenityIds.includes(amenity.id)}
                    onChange={() => toggleAmenity(amenity.id)}
                  />
                  {amenity.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* --- Booking Limits --- */}
        <div className="roomFormSectionGroup">
          <h2 className="roomFormSectionTitle">Booking Limits</h2>
          <p className="roomFormSectionSubtitle">Overrides just for this room — leave at the resort-wide default (set in Booking Rules) unless this room needs different limits.</p>
          <div className="roomFormRow">
            <div className="roomFormField">
              <label htmlFor="roomMinNights">Min Nights / Booking</label>
              <input id="roomMinNights" type="number" {...register("minNightsPerBooking")} />
              <p className="roomFormHint">The fewest nights a guest can book this room for in one reservation, e.g. 2 to discourage single-night stays.</p>
            </div>
            <div className="roomFormField">
              <label htmlFor="roomMaxNights">Max Nights / Booking</label>
              <input id="roomMaxNights" type="number" {...register("maxNightsPerBooking")} />
              <p className="roomFormHint">The longest a single reservation can run, e.g. 30 to prevent open-ended long-term stays.</p>
            </div>
            <div className="roomFormField">
              <label htmlFor="roomMinGuests">Min Guests Allowed</label>
              <input id="roomMinGuests" type="number" {...register("minGuestsAllowed")} />
              <p className="roomFormHint">The fewest guests required to book — usually 1, unless this room is priced for groups only.</p>
            </div>
          </div>
        </div>

        {/* --- Visibility --- */}
        <div className="roomFormSectionGroup">
          <h2 className="roomFormSectionTitle">Visibility</h2>
          <div className="roomFormToggleRow">
            <label className="roomFormToggle">
              <input type="checkbox" {...register("isFeatured")} />
              Featured on homepage
            </label>
            <label className="roomFormToggle">
              <input type="checkbox" {...register("isActive")} />
              Visible to guests (active)
            </label>
          </div>
          <p className="roomFormHint">Featured rooms appear in the homepage highlights. Turning off &quot;Active&quot; hides the room from guests without deleting it.</p>
        </div>

        <div className="roomFormActions">
          <button type="button" className="roomFormButton roomFormButton--neutral" onClick={() => router.push("/superAdmin/content/rooms")}>
            Cancel
          </button>
          <button type="submit" className="roomFormButton roomFormButton--primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
