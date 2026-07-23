/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/BlackoutDatesSection.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Section 6 of Booking Rules & Configuration. Showcases every existing
 * room with its LIVE status — never a filtered list of only the rooms
 * that happen to have a blackout entry. Status is one of:
 *   - "Booked (Auto)"    — a confirmed booking covers right now
 *   - "Cleaning (Auto)"  — guest just checked out, still inside the
 *                          general Cleaning Hours window (Section 1)
 *   - "Available (Auto)" — neither of the above
 *   - "Maintenance" / "Private" / "Custom" — a manual blackout range
 *     the admin set for that room, which always wins over the auto
 *     states above
 * The three auto states are computed server-side (services/roomStatus.js)
 * and never stored — nothing to edit there. Only the manual override
 * is a real BlackoutDate row the admin can add, edit, or remove.
 *
 * DATA FLOW:
 * 1. useRoomStatus() fetches every room's live status on mount
 * 2. A room with no manual override shows a single "Block Dates"
 *    action; a room already under a manual override shows "Edit" /
 *    "Remove" instead — never both, never a redundant button
 * 3. "Block Dates" / "Edit" opens BlackoutDateModal for that ONE room
 *    (no room picker — the room is already fixed by which row was
 *    clicked); submitting calls createBlackoutDate/updateBlackoutDate,
 *    then refetches both the blackout list and the live room status
 * 4. "Remove" opens ConfirmationModal; confirming calls
 *    deleteBlackoutDate() then refetches room status
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useBlackoutDates } from "@/hooks/useBlackoutDates";
import { useRoomStatus } from "@/hooks/useRoomStatus";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

// "Cleaning" is intentionally absent — it's now auto-computed, never a
// manually-selectable reason (see services/roomStatus.js).
const REASON_OPTIONS = ["Maintenance", "Private", "Custom"];

const blackoutDateSchema = z.object({
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

/**
 * formatDisplayDate
 * Short "Jul 2" style date for the Details column — compact on
 * purpose so the row never wraps.
 */
function formatDisplayDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * formatDisplayTime
 * Short "12:00 PM" style time for auto-status Details (checkout /
 * cleaning-until timestamps returned by services/roomStatus.js).
 */
function formatDisplayTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * roomStatusDetails
 * Builds the short Details column text for one room's live status —
 * different shape per status, so each reads naturally instead of
 * forcing one generic template on every case.
 */
function roomStatusDetails(roomStatus) {
  if (roomStatus.source === "manual") {
    return `${formatDisplayDate(roomStatus.startDate)} – ${formatDisplayDate(roomStatus.endDate)}`;
  }
  if (roomStatus.status === "booked") {
    return `${roomStatus.guestName} — until ${formatDisplayDate(roomStatus.checkOutAt)}, ${formatDisplayTime(roomStatus.checkOutAt)}`;
  }
  if (roomStatus.status === "cleaning") {
    return `Until ${formatDisplayTime(roomStatus.cleaningUntil)}`;
  }
  return "Open for booking";
}

function BlackoutDateModal({ isOpen, roomName, existingEntry, onSubmit, onCancel }) {
  const isEditMode = Boolean(existingEntry);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(blackoutDateSchema),
    defaultValues: {
      startDate: toDateInputValue(existingEntry?.startDate),
      endDate: toDateInputValue(existingEntry?.endDate),
      reason: existingEntry?.reasonLabel ?? "Maintenance",
    },
  });

  if (!isOpen) return null;

  return (
    <div className="bookingRulesModalBackdrop" role="dialog" aria-modal="true">
      <div className="bookingRulesModalDialog bookingRulesModalDialog--compact">
        <div>
          <h2 className="bookingRulesSectionTitle">{isEditMode ? "Edit Blocked Dates" : "Block Dates"}</h2>
          <p className="bookingRulesSectionSubtitle">{roomName}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm">
          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="blackoutStart">Start Date <span aria-hidden="true">*</span></label>
              <input id="blackoutStart" type="date" autoFocus {...register("startDate")} />
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

export default function BlackoutDatesSection({ showToast }) {
  const { createBlackoutDate, updateBlackoutDate, deleteBlackoutDate } = useBlackoutDates();
  const { roomStatuses, isLoading, error, refetchRoomStatuses } = useRoomStatus();

  // { roomId, roomName, entry: existing room-status row (source "manual")
  // or null } — null closes the modal, entry: null means "Block Dates"
  // (create mode).
  const [modalTarget, setModalTarget] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function handleSubmit(data) {
    try {
      if (modalTarget.entry) {
        await updateBlackoutDate(modalTarget.entry.blackoutId, data);
        showToast("✓ Blocked dates updated successfully.", "success");
      } else {
        await createBlackoutDate({ ...data, roomId: modalTarget.roomId });
        showToast("✓ Dates blocked successfully.", "success");
      }
      setModalTarget(null);
      await refetchRoomStatuses();
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this blackout range. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteBlackoutDate(pendingDelete.blackoutId);
      showToast("✓ Blocked dates removed successfully.", "success");
      await refetchRoomStatuses();
    } catch {
      showToast("✕ Failed to remove blocked dates.", "error");
    } finally {
      setPendingDelete(null);
    }
  }

  const columns = [
    { key: "room", label: "Room" },
    { key: "status", label: "Status" },
    { key: "details", label: "Details" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = roomStatuses.map((roomStatus) => ({
    id: roomStatus.roomId,
    room: roomStatus.roomName,
    status: <StatusBadge status={roomStatus.status} />,
    details: roomStatusDetails(roomStatus),
    actions:
      roomStatus.source === "manual" ? (
        <div className="bookingRulesRowActions">
          <button
            type="button"
            className="bookingRulesRowActionButton"
            onClick={() => setModalTarget({ roomId: roomStatus.roomId, roomName: roomStatus.roomName, entry: roomStatus })}
          >
            Edit
          </button>
          <button
            type="button"
            className="bookingRulesRowActionButton bookingRulesRowActionButton--destructive"
            onClick={() => setPendingDelete(roomStatus)}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="bookingRulesRowActions">
          <button
            type="button"
            className="bookingRulesRowActionButton"
            onClick={() => setModalTarget({ roomId: roomStatus.roomId, roomName: roomStatus.roomName, entry: null })}
          >
            Block Dates
          </button>
        </div>
      ),
  }));

  return (
    <section className="bookingRulesSection">
      <div>
        <h2 className="bookingRulesSectionTitle">Section 6: Blackout Dates</h2>
        <p className="bookingRulesSectionSubtitle">Live status of every room. Booked, Cleaning, and Available update automatically — block dates manually only for maintenance, private, or custom use.</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No rooms yet. Add a room under Rooms Management first."
      />

      {modalTarget && (
        <BlackoutDateModal
          key={modalTarget.entry?.blackoutId ?? `${modalTarget.roomId}-new`}
          isOpen
          roomName={modalTarget.roomName}
          existingEntry={modalTarget.entry}
          onSubmit={handleSubmit}
          onCancel={() => setModalTarget(null)}
        />
      )}

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Remove Blocked Dates?"
        description={
          pendingDelete
            ? `Are you sure you want to remove the blocked dates for ${pendingDelete.roomName}? This cannot be undone.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
