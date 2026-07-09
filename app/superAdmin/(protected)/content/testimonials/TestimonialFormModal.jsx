/**
 * FILE: app/superAdmin/(protected)/content/testimonials/TestimonialFormModal.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create/Edit modal for a single testimonial (blueprint Page 5).
 * Shared by both the "Create New" and row "Edit" actions —
 * `existingTestimonial` is null in create mode. Handles the optional
 * guest photo upload to R2 (aspect 1:1).
 *
 * DATA FLOW:
 * 1. React Hook Form + Zod validate the fields on submit (Rule 31.7)
 * 2. If a new photo file was chosen, it's uploaded to
 *    /api/superAdmin/content/upload first — the returned url/key are
 *    then included in the testimonial payload
 * 3. onSubmit calls the createTestimonial/updateTestimonial callback
 *    passed in by the parent — this modal never talks to the
 *    testimonials API directly
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import Image from "next/image";
import "./Testimonials.css";

const testimonialSchema = z.object({
  guestName: z.string().min(1, "Guest name is required."),
  rating: z.coerce.number().min(1).max(5),
  quote: z.string().min(1, "Quote is required.").max(500, "Quote must be 500 characters or fewer."),
  isFeatured: z.boolean(),
  displayOrder: z.coerce.number().min(0),
});

export default function TestimonialFormModal({ isOpen, existingTestimonial, onSubmit, onCancel }) {
  const isEditMode = Boolean(existingTestimonial);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(existingTestimonial?.guestPhoto ?? null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(testimonialSchema),
    defaultValues: {
      guestName: existingTestimonial?.guestName ?? "",
      rating: existingTestimonial?.rating ?? 5,
      quote: existingTestimonial?.quote ?? "",
      isFeatured: existingTestimonial?.isFeatured ?? false,
      displayOrder: existingTestimonial?.displayOrder ?? 0,
    },
  });

  const quoteValue = watch("quote") ?? "";

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  /**
   * handleFormSubmit
   * Uploads the guest photo first (if a new one was chosen), then
   * hands the full payload up to the parent's create/update callback.
   */
  async function handleFormSubmit(data) {
    try {
      let guestPhoto = existingTestimonial?.guestPhoto ?? null;
      let guestPhotoKey = existingTestimonial?.guestPhotoKey ?? null;

      if (selectedPhotoFile) {
        setIsUploadingPhoto(true);
        const uploadFormData = new FormData();
        uploadFormData.append("file", selectedPhotoFile);
        uploadFormData.append("folder", "testimonials");

        const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);
        guestPhoto = uploadResponse.data.data.url;
        guestPhotoKey = uploadResponse.data.data.key;
        setIsUploadingPhoto(false);
      }

      await onSubmit({ ...data, guestPhoto, guestPhotoKey });
    } catch (submitError) {
      setIsUploadingPhoto(false);
      throw submitError;
    }
  }

  if (!isOpen) return null;

  return (
    <div className="testimonialModalBackdrop" role="dialog" aria-modal="true">
      <div className="testimonialModalDialog">
        <h2 className="testimonialsTitle">{isEditMode ? "Edit Testimonial" : "Add Testimonial"}</h2>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="testimonialForm">
          <div className="testimonialFormField">
            <label htmlFor="testimonialGuestName">Guest Name <span aria-hidden="true">*</span></label>
            <input id="testimonialGuestName" type="text" autoFocus {...register("guestName")} />
            {errors.guestName && <span role="alert" className="testimonialFormError">{errors.guestName.message}</span>}
          </div>

          <div className="testimonialFormRow">
            <div className="testimonialFormField">
              <label htmlFor="testimonialRating">Star Rating</label>
              <select id="testimonialRating" {...register("rating")}>
                {[5, 4, 3, 2, 1].map((star) => (
                  <option key={star} value={star}>{"★".repeat(star)} ({star})</option>
                ))}
              </select>
            </div>

            <div className="testimonialFormField">
              <label htmlFor="testimonialDisplayOrder">Display Order</label>
              <input id="testimonialDisplayOrder" type="number" {...register("displayOrder")} />
              <p className="testimonialFormHint">Lower numbers show first in the guest reviews grid.</p>
            </div>
          </div>

          <div className="testimonialFormField">
            <label htmlFor="testimonialQuote">Quote <span aria-hidden="true">*</span></label>
            <textarea id="testimonialQuote" rows={4} maxLength={500} {...register("quote")} />
            <p className="testimonialFormHint testimonialFormCharCount">{quoteValue.length} / 500</p>
            {errors.quote && <span role="alert" className="testimonialFormError">{errors.quote.message}</span>}
          </div>

          <div className="testimonialFormField">
            <label htmlFor="testimonialPhoto">Guest Photo (optional, 1:1)</label>
            <div className="testimonialFormPhotoUpload">
              {photoPreviewUrl && (
                <div className="testimonialFormPhotoPreviewWrapper">
                  {/* unoptimized for a freshly-selected local file — its blob: URL
                      is never a configured remote host for next/image to optimize */}
                  <Image
                    src={photoPreviewUrl}
                    alt="Guest photo preview"
                    fill
                    sizes="80px"
                    style={{ objectFit: "cover" }}
                    unoptimized={Boolean(selectedPhotoFile)}
                  />
                </div>
              )}
              <input id="testimonialPhoto" type="file" accept="image/*" onChange={handlePhotoChange} />
            </div>
          </div>

          <label className="testimonialFormToggle">
            <input type="checkbox" {...register("isFeatured")} />
            Featured (shows on homepage)
          </label>

          <div className="testimonialFormActions">
            <button type="button" className="testimonialFormButton testimonialFormButton--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="testimonialFormButton testimonialFormButton--primary" disabled={isSubmitting || isUploadingPhoto}>
              {isSubmitting || isUploadingPhoto ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
