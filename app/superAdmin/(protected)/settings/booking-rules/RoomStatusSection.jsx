/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/RoomStatusSection.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Section 6 of Booking Rules & Configuration. Replaces the old flat
 * "list every blackout range across all rooms" table with one card
 * per active room, showing its CURRENT status:
 *   - Booked (auto) — a confirmed booking's stay covers right now
 *   - Checked-Out — Cleaning (auto) — within `cleaningHours` after
 *     that booking's checkout moment
 *   - Available (auto) — neither of the above
 *   - Maintenance / Private / Custom (manual) — an admin explicitly
 *     took this room offline via "Edit" below, overriding all of the
 *     above regardless of booking data
 * All computation for the first three lives in services/roomStatus.js
 * — this component never guesses at booking math itself.
 *
 * "Cleaning" is no longer a choice in the Edit modal — it's now fully
 * automatic, driven by the "Cleaning Hours" setting shown in this
 * section's header. Editing a room's status also no longer asks which
 * room — that's already the card you clicked "Edit" on.
 *
 * DATA FLOW:
 * 1. useRoomStatus() fetches every active room's computed status +
 *    the current cleaningHours setting on mount
 * 2. A room card's "Edit" opens RoomStatusModal pre-scoped to that
 *    room (no room picker); submitting calls createBlackoutDate or
 *    updateBlackoutDate (existing blackout-dates CRUD), then refetches
 * 3. "Clear Override" (shown only when a room has a manual status)
 *    calls deleteBlackoutDate() to return the room to auto-computed
 *    status, then refetches
 * 4. The "Cleaning Hours" field in the header calls
 *    updateCleaningHours() on blur/save
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRoomStatus } from "@/hooks/useRoomStatus";
import { useBlackoutDates } from "@/hooks/useBlackoutDates";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

const MANUAL_REASON_OPTIONS = ["Maintenance", "Private", "Custom"];

const manualStatusSchema = z.object({
  reason: z.enum(["Maintenance", "Private", "Custom"]),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
});

function toDateInputValue(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

/** Small colored dot + label — one badge style shared by every status. */
function RoomStatusBadge({ status, label }) {
  return (
    <span className={`roomStatusBadge roomStatusBadge--${status}`}>
      <span className="roomStatusDot" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * RoomStatusModal
 * Compact — no room picker (the room is already implied by which
 * card's "Edit" was clicked) and only the 3 manual reasons, since
 * Cleaning is fully automatic now. Kept intentionally short so it
 * never leaves large empty space below its fields.
 */
function RoomStatusModal({ isOpen, room, existingBlackout, onSubmit, onCancel }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(manualStatusSchema),
    defaultValues: {
      reason: existingBlackout?.reason ?? "Maintenance",
      startDate: toDateInputValue(existingBlackout?.startDate) || new Date().toISOString().slice(0, 10),
      endDate: toDateInputValue(existingBlackout?.endDate) || new Date().toISOString().slice(0, 10),
    },
  });

  if (!isOpen) return null;

  return (
    <div className="bookingRulesModalBackdrop" role="dialog" aria-modal="true">
      <div className="bookingRulesModalDialog bookingRulesModalDialog--compact">
        <h2 className="bookingRulesSectionTitle">{room?.name}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm">
          <div className="bookingRulesFormField">
            <label htmlFor="roomStatusReason">Reason <span aria-hidden="true">*</span></label>
            <select id="roomStatusReason" autoFocus {...register("reason")}>
              {MANUAL_REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </div>

          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="roomStatusStart">Start Date <span aria-hidden="true">*</span></label>
              <input id="roomStatusStart" type="date" {...register("startDate")} />
              {errors.startDate && <span role="alert" className="bookingRulesFormError">{errors.startDate.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="roomStatusEnd">End Date <span aria-hidden="true">*</span></label>
              <input id="roomStatusEnd" type="date" {...register("endDate")} />
              {errors.endDate && <span role="alert" className="bookingRulesFormError">{errors.endDate.message}</span>}
            </div>
          </div>

          <div className="bookingRulesFormActions">
            <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="bookingRulesButton bookingRulesButton--primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RoomStatusSection({ showToast }) {
  const { roomStatuses, cleaningHours, isLoading, error, refetchRoomStatuses, updateCleaningHours } = useRoomStatus();
  const { createBlackoutDate, updateBlackoutDate, deleteBlackoutDate } = useBlackoutDates();

  const [editTarget, setEditTarget] = useState(null); // { room, blackoutId? }
  const [pendingClear, setPendingClear] = useState(null); // { room, blackoutId, label }
  const [cleaningHoursDraft, setCleaningHoursDraft] = useState(cleaningHours);

  // Keep the draft in sync once the real value loads, without
  // clobbering it while the admin is actively typing a new value.
  if (!isLoading && cleaningHoursDraft === undefined) {
    setCleaningHoursDraft(cleaningHours);
  }

  async function handleModalSubmit(data) {
    try {
      if (editTarget.blackoutId) {
        await updateBlackoutDate(editTarget.blackoutId, { ...data, roomId: editTarget.room.id });
        showToast(`✓ "${editTarget.room.name}" updated to ${data.reason}.`, "success");
      } else {
        await createBlackoutDate({ ...data, roomId: editTarget.room.id });
        showToast(`✓ "${editTarget.room.name}" set to ${data.reason}.`, "success");
      }
      setEditTarget(null);
      await refetchRoomStatuses();
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this change. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmClear() {
    try {
      await deleteBlackoutDate(pendingClear.blackoutId);
      showToast(`✓ "${pendingClear.room.name}" returned to automatic status.`, "success");
      await refetchRoomStatuses();
    } catch {
      showToast("✕ Failed to clear this override.", "error");
    } finally {
      setPendingClear(null);
    }
  }

  async function handleSaveCleaningHours() {
    try {
      await updateCleaningHours(Number(cleaningHoursDraft));
      showToast(`✓ Cleaning hours updated to ${cleaningHoursDraft}.`, "success");
    } catch {
      showToast("✕ Failed to update cleaning hours.", "error");
    }
  }

  return (
    <section className="bookingRulesSection">
      <div className="bookingRulesSectionHeaderRow">
        <div>
          <h2 className="bookingRulesSectionTitle">Section 6: Room Status</h2>
          <p className="bookingRulesSectionSubtitle">
            Booked and Checked-Out — Cleaning are automatic, based on actual bookings and the cleaning window
            below. Use Edit on a room only for Maintenance, Private use, or a custom reason.
          </p>
        </div>
        <div className="roomStatusCleaningHoursField">
          <label htmlFor="cleaningHoursInput">Cleaning Hours (Resort-Wide)</label>
          <input
            id="cleaningHoursInput"
            type="number"
            min="0"
            max="24"
            value={cleaningHoursDraft ?? cleaningHours}
            onChange={(event) => setCleaningHoursDraft(event.target.value)}
            onBlur={handleSaveCleaningHours}
          />
        </div>
      </div>

      {isLoading && <p className="bookingRulesHint">Loading room statuses…</p>}
      {!isLoading && error && <p className="bookingRulesFormError">{error}</p>}
      {!isLoading && !error && roomStatuses.length === 0 && (
        <p className="bookingRulesHint">No active rooms yet — add one under Content &gt; Rooms first.</p>
      )}

      {!isLoading && !error && roomStatuses.length > 0 && (
        <div className="roomStatusGrid">
          {roomStatuses.map((entry) => (
            <div key={entry.room.id} className="roomStatusCard">
              <div className="roomStatusCardHeader">
                <span className="roomStatusCardName">{entry.room.name}</span>
                <RoomStatusBadge status={entry.status} label={entry.label} />
              </div>
              {entry.until && (
                <p className="roomStatusCardMeta">
                  {entry.status === "booked" ? "Until" : entry.status === "cleaning" ? "Available at" : "Until"}{" "}
                  {new Date(entry.until).toLocaleString("en-US", {
                    timeZone: "Asia/Manila",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
              <div className="bookingRulesRowActions">
                <button
                  type="button"
                  className="bookingRulesRowActionButton"
                  onClick={() => setEditTarget({ room: entry.room, blackoutId: entry.blackoutId })}
                >
                  Edit
                </button>
                {!entry.auto && (
                  <button
                    type="button"
                    className="bookingRulesRowActionButton bookingRulesRowActionButton--destructive"
                    onClick={() => setPendingClear({ room: entry.room, blackoutId: entry.blackoutId, label: entry.label })}
                  >
                    Clear Override
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <RoomStatusModal
        key={editTarget ? `${editTarget.room.id}-${editTarget.blackoutId ?? "new"}` : "closed"}
        isOpen={Boolean(editTarget)}
        room={editTarget?.room}
        existingBlackout={
          editTarget?.blackoutId
            ? (() => {
                const matchingEntry = roomStatuses.find((entry) => entry.room.id === editTarget.room.id);
                return matchingEntry
                  ? { reason: matchingEntry.label, startDate: matchingEntry.since, endDate: matchingEntry.until }
                  : null;
              })()
            : null
        }
        onSubmit={handleModalSubmit}
        onCancel={() => setEditTarget(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(pendingClear)}
        title="Clear Override?"
        description={
          pendingClear
            ? `Return "${pendingClear.room.name}" to its automatic status? It's currently set to ${pendingClear.label} manually.`
            : ""
        }
        confirmLabel="Clear Override"
        onConfirm={handleConfirmClear}
        onCancel={() => setPendingClear(null)}
      />
    </section>
  );
}
