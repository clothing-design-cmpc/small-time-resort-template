/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/SeasonalPricingSection.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Section 5 of Booking Rules & Configuration. Lists every seasonal
 * price override across all rooms, and lets the admin add, edit, or
 * delete entries via a modal (season name, date range, price override).
 *
 * DATA FLOW:
 * 1. useSeasonalPricing() fetches all entries on mount
 * 2. "Add Season" or a row's "Edit" opens SeasonalPriceModal in the
 *    matching mode; submitting calls createSeasonalPrice/
 *    updateSeasonalPrice
 * 3. "Delete" opens ConfirmationModal; confirming calls
 *    deleteSeasonalPrice() then shows a toast
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSeasonalPricing } from "@/hooks/useSeasonalPricing";
import DataTable from "@/components/superAdmin/DataTable";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

const seasonalPriceSchema = z.object({
  roomId: z.string().min(1, "Please select a room."),
  seasonName: z.string().min(1, "Season name is required."),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
  pricePerNight: z.coerce.number().min(0, "Price must be 0 or more."),
});

/**
 * toDateInputValue
 * Formats an ISO date string as "YYYY-MM-DD" for a native date input.
 */
function toDateInputValue(isoString) {
  return isoString ? isoString.slice(0, 10) : "";
}

function SeasonalPriceModal({ isOpen, existingEntry, rooms, onSubmit, onCancel }) {
  const isEditMode = Boolean(existingEntry);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(seasonalPriceSchema),
    defaultValues: {
      roomId: existingEntry?.roomId ?? "",
      seasonName: existingEntry?.seasonName ?? "",
      startDate: toDateInputValue(existingEntry?.startDate),
      endDate: toDateInputValue(existingEntry?.endDate),
      pricePerNight: existingEntry?.pricePerNight ?? 0,
    },
  });

  if (!isOpen) return null;

  return (
    <div className="bookingRulesModalBackdrop" role="dialog" aria-modal="true">
      <div className="bookingRulesModalDialog">
        <h2 className="bookingRulesSectionTitle">{isEditMode ? "Edit Season" : "Add Season"}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm">
          <div className="bookingRulesFormField">
            <label htmlFor="seasonRoom">Room <span aria-hidden="true">*</span></label>
            <select id="seasonRoom" disabled={isEditMode} {...register("roomId")}>
              <option value="">Select a room…</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
            {errors.roomId && <span role="alert" className="bookingRulesFormError">{errors.roomId.message}</span>}
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="seasonName">Season Name <span aria-hidden="true">*</span></label>
            <input id="seasonName" type="text" placeholder="Peak Season, Shoulder, Off-Season…" {...register("seasonName")} />
            {errors.seasonName && <span role="alert" className="bookingRulesFormError">{errors.seasonName.message}</span>}
          </div>

          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="seasonStart">Start Date <span aria-hidden="true">*</span></label>
              <input id="seasonStart" type="date" {...register("startDate")} />
              {errors.startDate && <span role="alert" className="bookingRulesFormError">{errors.startDate.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="seasonEnd">End Date <span aria-hidden="true">*</span></label>
              <input id="seasonEnd" type="date" {...register("endDate")} />
              {errors.endDate && <span role="alert" className="bookingRulesFormError">{errors.endDate.message}</span>}
            </div>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="seasonPrice">Price / Night Override (₱) <span aria-hidden="true">*</span></label>
            <input id="seasonPrice" type="number" step="0.01" {...register("pricePerNight")} />
            <p className="bookingRulesHint">Replaces the room&apos;s default nightly rate for any stay inside this date range.</p>
            {errors.pricePerNight && <span role="alert" className="bookingRulesFormError">{errors.pricePerNight.message}</span>}
          </div>

          <div className="bookingRulesFormActions">
            <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="bookingRulesButton bookingRulesButton--primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SeasonalPricingSection({ rooms, showToast }) {
  const { seasonalPrices, isLoading, error, createSeasonalPrice, updateSeasonalPrice, deleteSeasonalPrice } =
    useSeasonalPricing();

  const [modalTarget, setModalTarget] = useState(null); // null closed, {} create, entry = edit
  const [pendingDelete, setPendingDelete] = useState(null);

  async function handleSubmit(data) {
    try {
      if (modalTarget?.id) {
        await updateSeasonalPrice(modalTarget.id, data);
        showToast("✓ Seasonal price updated successfully.", "success");
      } else {
        await createSeasonalPrice(data);
        showToast(`✓ "${data.seasonName}" added successfully.`, "success");
      }
      setModalTarget(null);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this season. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteSeasonalPrice(pendingDelete.id);
      showToast(`✓ "${pendingDelete.seasonName}" deleted successfully.`, "success");
    } catch {
      showToast("✕ Failed to delete seasonal price.", "error");
    } finally {
      setPendingDelete(null);
    }
  }

  const columns = [
    { key: "room", label: "Room" },
    { key: "season", label: "Season Name" },
    { key: "range", label: "Date Range" },
    { key: "price", label: "Price / Night", align: "right", mono: true },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = seasonalPrices.map((entry) => ({
    id: entry.id,
    room: entry.room?.name ?? "—",
    season: entry.seasonName,
    range: `${toDateInputValue(entry.startDate)} → ${toDateInputValue(entry.endDate)}`,
    price: `₱${Number(entry.pricePerNight).toLocaleString()}`,
    actions: (
      <div className="bookingRulesRowActions">
        <button type="button" className="bookingRulesRowActionButton" onClick={() => setModalTarget(entry)}>
          Edit
        </button>
        <button
          type="button"
          className="bookingRulesRowActionButton bookingRulesRowActionButton--destructive"
          onClick={() => setPendingDelete(entry)}
        >
          Delete
        </button>
      </div>
    ),
  }));

  return (
    <section className="bookingRulesSection">
      <div className="bookingRulesSectionHeaderRow">
        <div>
          <h2 className="bookingRulesSectionTitle">Section 5: Seasonal Pricing</h2>
          <p className="bookingRulesSectionSubtitle">Date-range price overrides per room (peak, shoulder, off-season, etc.).</p>
        </div>
        <button type="button" className="bookingRulesAddButton" onClick={() => setModalTarget({})}>
          + Add Season
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No seasonal pricing set yet. Click “Add Season” to create the first one."
      />

      <SeasonalPriceModal
        key={modalTarget?.id ?? (modalTarget ? "new" : "closed")}
        isOpen={Boolean(modalTarget)}
        existingEntry={modalTarget?.id ? modalTarget : null}
        rooms={rooms}
        onSubmit={handleSubmit}
        onCancel={() => setModalTarget(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Delete Seasonal Price?"
        description={
          pendingDelete
            ? `Are you sure you want to delete "${pendingDelete.seasonName}" for ${pendingDelete.room?.name ?? "this room"}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
