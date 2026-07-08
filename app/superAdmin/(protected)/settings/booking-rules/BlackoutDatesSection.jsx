/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/BlackoutDatesSection.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Section 6 of Booking Rules & Configuration. Lists every blackout
 * date range across all rooms (Room | Start Date | End Date | Reason |
 * Actions, per the blueprint spec), and lets the admin add, edit, or
 * delete ranges via a modal.
 *
 * DATA FLOW:
 * 1. useBlackoutDates() fetches all entries on mount
 * 2. "Block Dates" or a row's "Edit" opens BlackoutDateModal in the
 *    matching mode; submitting calls createBlackoutDate/
 *    updateBlackoutDate
 * 3. "Delete" opens ConfirmationModal; confirming calls
 *    deleteBlackoutDate() then shows a toast
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useBlackoutDates } from "@/hooks/useBlackoutDates";
import DataTable from "@/components/superAdmin/DataTable";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

const REASON_OPTIONS = ["Cleaning", "Maintenance", "Private", "Custom"];

const blackoutDateSchema = z.object({
  roomId: z.string().min(1, "Please select a room."),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
  reason: z.string().min(1),
});

/**
 * toDateInputValue
 * Formats an ISO date string as "YYYY-MM-DD" for a native date input.
 */
function toDateInputValue(isoString) {
  return isoString ? isoString.slice(0, 10) : "";
}

function BlackoutDateModal({ isOpen, existingEntry, rooms, onSubmit, onCancel }) {
  const isEditMode = Boolean(existingEntry);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(blackoutDateSchema),
    defaultValues: {
      roomId: existingEntry?.roomId ?? "",
      startDate: toDateInputValue(existingEntry?.startDate),
      endDate: toDateInputValue(existingEntry?.endDate),
      reason: existingEntry?.reason ?? "Cleaning",
    },
  });

  if (!isOpen) return null;

  return (
    <div className="bookingRulesModalBackdrop" role="dialog" aria-modal="true">
      <div className="bookingRulesModalDialog">
        <h2 className="bookingRulesSectionTitle">{isEditMode ? "Edit Blackout Range" : "Block Dates"}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm">
          <div className="bookingRulesFormField">
            <label htmlFor="blackoutRoom">Room <span aria-hidden="true">*</span></label>
            <select id="blackoutRoom" disabled={isEditMode} {...register("roomId")}>
              <option value="">Select a room…</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
            {errors.roomId && <span role="alert" className="bookingRulesFormError">{errors.roomId.message}</span>}
          </div>

          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="blackoutStart">Start Date <span aria-hidden="true">*</span></label>
              <input id="blackoutStart" type="date" {...register("startDate")} />
              {errors.startDate && <span role="alert" className="bookingRulesFormError">{errors.startDate.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="blackoutEnd">End Date <span aria-hidden="true">*</span></label>
              <input id="blackoutEnd" type="date" {...register("endDate")} />
              {errors.endDate && <span role="alert" className="bookingRulesFormError">{errors.endDate.message}</span>}
            </div>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="blackoutReason">Reason</label>
            <select id="blackoutReason" {...register("reason")}>
              {REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
            <p className="bookingRulesHint">Shown to you in this list only — guests just see the dates as unavailable.</p>
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

export default function BlackoutDatesSection({ rooms, showToast }) {
  const { blackoutDates, isLoading, error, createBlackoutDate, updateBlackoutDate, deleteBlackoutDate } =
    useBlackoutDates();

  const [modalTarget, setModalTarget] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function handleSubmit(data) {
    try {
      if (modalTarget?.id) {
        await updateBlackoutDate(modalTarget.id, data);
        showToast("✓ Blackout range updated successfully.", "success");
      } else {
        await createBlackoutDate(data);
        showToast("✓ Dates blocked successfully.", "success");
      }
      setModalTarget(null);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this blackout range. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteBlackoutDate(pendingDelete.id);
      showToast("✓ Blackout range deleted successfully.", "success");
    } catch {
      showToast("✕ Failed to delete blackout range.", "error");
    } finally {
      setPendingDelete(null);
    }
  }

  const columns = [
    { key: "room", label: "Room" },
    { key: "start", label: "Start Date" },
    { key: "end", label: "End Date" },
    { key: "reason", label: "Reason" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = blackoutDates.map((entry) => ({
    id: entry.id,
    room: entry.room?.name ?? "—",
    start: toDateInputValue(entry.startDate),
    end: toDateInputValue(entry.endDate),
    reason: entry.reason,
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
          <h2 className="bookingRulesSectionTitle">Section 6: Blackout Dates</h2>
          <p className="bookingRulesSectionSubtitle">Dates a room is unavailable regardless of the booking calendar — cleaning, maintenance, or private use.</p>
        </div>
        <button type="button" className="bookingRulesAddButton" onClick={() => setModalTarget({})}>
          + Block Dates
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No blackout dates yet. Click “Block Dates” to add the first one."
      />

      <BlackoutDateModal
        key={modalTarget?.id ?? (modalTarget ? "new" : "closed")}
        isOpen={Boolean(modalTarget)}
        existingEntry={modalTarget?.id ? modalTarget : null}
        rooms={rooms}
        onSubmit={handleSubmit}
        onCancel={() => setModalTarget(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Delete Blackout Range?"
        description={
          pendingDelete
            ? `Are you sure you want to delete this blackout range for ${pendingDelete.room?.name ?? "this room"}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
