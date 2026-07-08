/**
 * FILE: app/superAdmin/(protected)/content/activities/ActivityForm.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create/Edit form for a single activity (blueprint Page 4). Shared by
 * the "new" and "[activityId]" routes — `existingActivity` is null for
 * create mode. Handles image upload to R2 (aspect 16:9).
 *
 * DATA FLOW:
 * 1. React Hook Form + Zod validate the fields on submit (Rule 31.7)
 * 2. If a new image file was chosen, it's uploaded to
 *    /api/superAdmin/content/upload first — the returned url/key are
 *    then included in the activity payload
 * 3. POST (create) or PUT (edit) to /api/superAdmin/content/activities
 *    — on success, show a toast and redirect back to the list
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
import "./Activities.css";

const activitySchema = z
  .object({
    name: z.string().min(1, "Activity name is required."),
    description: z.string().optional(),
    duration: z.string().optional(),
    minGroupSize: z.coerce.number().min(1, "Min group size must be at least 1."),
    maxGroupSize: z.coerce.number().min(1, "Max group size must be at least 1."),
    isFeatured: z.boolean(),
    isActive: z.boolean(),
  })
  // Cross-field check — max must never be below min, otherwise the
  // admin ends up with a group-size range that can never be satisfied.
  .refine((data) => data.maxGroupSize >= data.minGroupSize, {
    message: "Max group size must be greater than or equal to min group size.",
    path: ["maxGroupSize"],
  });

export default function ActivityForm({ existingActivity }) {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToast();
  const isEditMode = Boolean(existingActivity);

  const [imagePreviewUrl, setImagePreviewUrl] = useState(existingActivity?.imageUrl ?? null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      name: existingActivity?.name ?? "",
      description: existingActivity?.description ?? "",
      duration: existingActivity?.duration ?? "",
      minGroupSize: existingActivity?.minGroupSize ?? 1,
      maxGroupSize: existingActivity?.maxGroupSize ?? 10,
      isFeatured: existingActivity?.isFeatured ?? false,
      isActive: existingActivity?.isActive ?? true,
    },
  });

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  /**
   * onSubmit
   * Uploads the image first (if a new one was chosen), then creates or
   * updates the activity with the resulting URL/key plus all form fields.
   */
  async function onSubmit(data) {
    try {
      let imageUrl = existingActivity?.imageUrl ?? null;
      let imageKey = existingActivity?.imageKey ?? null;

      if (selectedImageFile) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", selectedImageFile);
        uploadFormData.append("folder", "activities");

        const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);
        imageUrl = uploadResponse.data.data.url;
        imageKey = uploadResponse.data.data.key;
      }

      const payload = { ...data, imageUrl, imageKey, sortOrder: existingActivity?.sortOrder ?? 0 };

      if (isEditMode) {
        await axios.put(`/api/superAdmin/content/activities/${existingActivity.id}`, payload);
        showToast("✓ Activity updated successfully.", "success");
      } else {
        await axios.post("/api/superAdmin/content/activities", payload);
        showToast(`✓ Activity "${data.name}" added successfully.`, "success");
      }

      router.push("/superAdmin/content/activities");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this activity. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  return (
    <section className="activityFormSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="activityFormHeaderRow">
        <span className="activitiesEyebrow">Content Management</span>
        <h1 className="activitiesTitle">{isEditMode ? "Edit Activity" : "Add Activity"}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="activityForm">
        <div className="activityFormField">
          <label htmlFor="activityName">Activity Name <span aria-hidden="true">*</span></label>
          <input id="activityName" type="text" autoFocus {...register("name")} />
          {errors.name && <span role="alert" className="activityFormError">{errors.name.message}</span>}
        </div>

        <div className="activityFormField">
          <label htmlFor="activityDescription">Description</label>
          <textarea id="activityDescription" rows={4} {...register("description")} />
        </div>

        <div className="activityFormRow">
          <div className="activityFormField">
            <label htmlFor="activityDuration">Duration</label>
            <input id="activityDuration" type="text" placeholder="e.g. 2 hours" {...register("duration")} />
          </div>

          <div className="activityFormField">
            <label htmlFor="activityMinGroup">Min Group Size</label>
            <input id="activityMinGroup" type="number" {...register("minGroupSize")} />
            {errors.minGroupSize && <span role="alert" className="activityFormError">{errors.minGroupSize.message}</span>}
          </div>

          <div className="activityFormField">
            <label htmlFor="activityMaxGroup">Max Group Size</label>
            <input id="activityMaxGroup" type="number" {...register("maxGroupSize")} />
            {errors.maxGroupSize && <span role="alert" className="activityFormError">{errors.maxGroupSize.message}</span>}
          </div>
        </div>

        <div className="activityFormField">
          <label htmlFor="activityImage">Activity Image (16:9)</label>
          <div className="activityFormImageUpload">
            {imagePreviewUrl && (
              <div className="activityFormImagePreviewWrapper">
                {/* unoptimized for a freshly-selected local file — its blob: URL
                    is never a configured remote host for next/image to optimize */}
                <Image
                  src={imagePreviewUrl}
                  alt="Activity preview"
                  fill
                  sizes="220px"
                  style={{ objectFit: "cover" }}
                  unoptimized={Boolean(selectedImageFile)}
                />
              </div>
            )}
            <input id="activityImage" type="file" accept="image/*" onChange={handleImageChange} />
          </div>
        </div>

        <div className="activityFormToggleRow">
          <label className="activityFormToggle">
            <input type="checkbox" {...register("isFeatured")} />
            Featured on homepage
          </label>
          <label className="activityFormToggle">
            <input type="checkbox" {...register("isActive")} />
            Visible to guests (active)
          </label>
        </div>

        <div className="activityFormActions">
          <button
            type="button"
            className="activityFormButton activityFormButton--neutral"
            onClick={() => router.push("/superAdmin/content/activities")}
          >
            Cancel
          </button>
          <button type="submit" className="activityFormButton activityFormButton--primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
