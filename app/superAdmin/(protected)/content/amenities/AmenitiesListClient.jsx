/**
 * FILE: app/superAdmin/(protected)/content/amenities/AmenitiesListClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Amenities Management list: header + "Create New" button,
 * the DataTable of amenities (icon preview, active state, actions),
 * the create/edit modal, a delete confirmation modal, and the toast
 * stack (blueprint Page 2).
 *
 * DATA FLOW:
 * 1. useAmenities() fetches all amenities on mount
 * 2. Clicking "Create New" or a row's "Edit" opens AmenityFormModal in
 *    the matching mode; submitting calls createAmenity/updateAmenity
 * 3. Clicking "Delete" opens ConfirmationModal; confirming calls
 *    deleteAmenity() then shows a success/error toast
 */
"use client";

import { useState } from "react";
import { useAmenities } from "@/hooks/useAmenities";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import { getIconByName } from "@/components/superAdmin/IconPicker";
import AmenityFormModal from "./AmenityFormModal";

/**
 * AmenityIconCell
 * Small named component (not an inline dynamic tag) so each row's icon
 * resolves through a normal component boundary the compiler can track.
 */
function AmenityIconCell({ iconName }) {
  const AmenityIcon = getIconByName(iconName);
  return (
    <span className="amenitiesIconCell" aria-hidden="true">
      {/* eslint-disable-next-line react-hooks/static-components -- AmenityIcon is a reference to one of the imported Lucide icons resolved by name, not a component created fresh each render */}
      <AmenityIcon size={18} strokeWidth={1.75} />
    </span>
  );
}

export default function AmenitiesListClient() {
  const { amenities, isLoading, error, createAmenity, updateAmenity, deleteAmenity } = useAmenities();
  const { toasts, showToast, dismissToast } = useToast();

  // null = modal closed. {} = create mode. An amenity object = edit mode.
  const [formModalTarget, setFormModalTarget] = useState(null);
  // Tracks which amenity is pending deletion so ConfirmationModal knows
  // what to show and what to delete when confirmed.
  const [amenityPendingDelete, setAmenityPendingDelete] = useState(null);

  async function handleFormSubmit(data) {
    try {
      if (formModalTarget?.id) {
        await updateAmenity(formModalTarget.id, data);
        showToast("✓ Amenity updated successfully.", "success");
      } else {
        await createAmenity(data);
        showToast(`✓ Amenity "${data.name}" added successfully.`, "success");
      }
      setFormModalTarget(null);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this amenity. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteAmenity(amenityPendingDelete.id);
      showToast(`✓ "${amenityPendingDelete.name}" deleted successfully.`, "success");
    } catch {
      showToast("✕ Failed to delete amenity.", "error");
    } finally {
      setAmenityPendingDelete(null);
    }
  }

  const columns = [
    { key: "name", label: "Amenity Name" },
    { key: "icon", label: "Icon", align: "center" },
    { key: "status", label: "Active?", align: "center" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = amenities.map((amenity) => {
    return {
      id: amenity.id,
      name: amenity.name,
      icon: <AmenityIconCell iconName={amenity.icon} />,
      status: <StatusBadge status={amenity.isActive ? "active" : "suspended"} />,
      actions: (
        <div className="amenitiesRowActions">
          <button
            type="button"
            className="amenitiesRowActionButton"
            onClick={(event) => {
              event.stopPropagation();
              setFormModalTarget(amenity);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="amenitiesRowActionButton amenitiesRowActionButton--destructive"
            onClick={(event) => {
              event.stopPropagation();
              setAmenityPendingDelete(amenity);
            }}
          >
            Delete
          </button>
        </div>
      ),
    };
  });

  return (
    <section className="amenitiesSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="amenitiesHeaderRow">
        <div>
          <span className="amenitiesEyebrow">Content Management</span>
          <h1 className="amenitiesTitle">Amenities</h1>
        </div>
        <button type="button" className="amenitiesAddButton" onClick={() => setFormModalTarget({})}>
          + Create New
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No amenities yet. Click “Create New” to add the first one."
      />

      {/* Keyed by target id so the form's defaultValues reset correctly
          whenever a different amenity (or a fresh "create" instance)
          is opened, without needing manual form.reset() plumbing. */}
      <AmenityFormModal
        key={formModalTarget?.id ?? (formModalTarget ? "new" : "closed")}
        isOpen={Boolean(formModalTarget)}
        existingAmenity={formModalTarget?.id ? formModalTarget : null}
        onSubmit={handleFormSubmit}
        onCancel={() => setFormModalTarget(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(amenityPendingDelete)}
        title="Delete Amenity?"
        description={
          amenityPendingDelete
            ? `Are you sure you want to delete "${amenityPendingDelete.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setAmenityPendingDelete(null)}
      />
    </section>
  );
}
