/**
 * FILE: app/superAdmin/(protected)/content/amenities/AmenityFormModal.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create/Edit modal for a single amenity (blueprint Page 2). Shared by
 * both the "Create New" and row "Edit" actions — `existingAmenity` is
 * null in create mode. Contains the name, description, icon selector,
 * and active toggle fields from the blueprint spec.
 *
 * DATA FLOW:
 * 1. React Hook Form + Zod validate the fields on submit (Rule 31.7)
 * 2. onSubmit calls the createAmenity/updateAmenity callback passed in
 *    by the parent — this modal never talks to the API directly, so
 *    the parent's useAmenities() hook stays the single source of truth
 */
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import IconPicker from "@/components/superAdmin/IconPicker";
import "./Amenities.css";

const amenitySchema = z.object({
  name: z.string().min(1, "Amenity name is required."),
  description: z.string().optional(),
  icon: z.string().min(1),
  isActive: z.boolean(),
});

export default function AmenityFormModal({ isOpen, existingAmenity, onSubmit, onCancel }) {
  const isEditMode = Boolean(existingAmenity);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(amenitySchema),
    // Keying by the amenity id (or "new") via `values` would need a
    // remount; simplest here is defaultValues since the modal is only
    // ever opened fresh — AmenitiesListClient always creates a new
    // instance of the form state per open via the `key` prop below.
    defaultValues: {
      name: existingAmenity?.name ?? "",
      description: existingAmenity?.description ?? "",
      icon: existingAmenity?.icon ?? "sparkles",
      isActive: existingAmenity?.isActive ?? true,
    },
  });

  const iconValue = watch("icon");

  if (!isOpen) return null;

  return (
    <div className="amenityModalBackdrop" role="dialog" aria-modal="true">
      <div className="amenityModalDialog">
        <h2 className="amenitiesTitle">{isEditMode ? "Edit Amenity" : "Create Amenity"}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="amenityForm">
          <div className="amenityFormField">
            <label htmlFor="amenityName">Amenity Name <span aria-hidden="true">*</span></label>
            <input id="amenityName" type="text" autoFocus {...register("name")} />
            <p className="amenityFormHint">What the guest sees, e.g. &quot;Free Wifi&quot; or &quot;Infinity Pool&quot;.</p>
            {errors.name && <span role="alert" className="amenityFormError">{errors.name.message}</span>}
          </div>

          <div className="amenityFormField">
            <label htmlFor="amenityDescription">Description</label>
            <textarea id="amenityDescription" rows={3} {...register("description")} />
            <p className="amenityFormHint">Optional. A short line shown on hover/detail views — not required for the icon list itself.</p>
          </div>

          <div className="amenityFormField">
            <label htmlFor="amenityIcon">Icon</label>
            <IconPicker
              id="amenityIcon"
              value={iconValue}
              onChange={(nextIcon) => setValue("icon", nextIcon, { shouldValidate: true })}
            />
            <p className="amenityFormHint">The icon shown next to this amenity everywhere it appears — on rooms, the amenities section, and this list.</p>
          </div>

          <label className="amenityFormToggle">
            <input type="checkbox" {...register("isActive")} />
            Active
          </label>
          <p className="amenityFormHint">Turning this off hides the amenity from guests and from the checklist on the Room form, without deleting it.</p>

          <div className="amenityFormActions">
            <button type="button" className="amenityFormButton amenityFormButton--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="amenityFormButton amenityFormButton--primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
